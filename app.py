from flask import Flask, render_template, redirect, url_for, request, flash, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from authlib.integrations.flask_client import OAuth
import os
import json
from datetime import datetime

app = Flask(__name__)

# --- CONFIGURAÇÕES ---
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'chave-super-secreta-local')

# Banco de Dados
database_url = os.environ.get('DATABASE_URL')
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = database_url or 'sqlite:///keka_recall.db'

db = SQLAlchemy(app)

# --- OAUTH SETUP (GOOGLE) ---
oauth = OAuth(app)

# Tenta pegar as credenciais do ambiente (Render) ou usa strings vazias (vai dar erro se não configurar)
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')

google = oauth.register(
    name='google',
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    access_token_url='https://oauth2.googleapis.com/token',
    access_token_params=None,
    authorize_url='https://accounts.google.com/o/oauth2/auth',
    authorize_params=None,
    api_base_url='https://www.googleapis.com/oauth2/v1/',
    client_kwargs={'scope': 'openid email profile https://www.googleapis.com/auth/calendar'},
    jwks_uri='https://www.googleapis.com/oauth2/v3/certs'
)

# --- LOGIN MANAGER ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- MODELOS ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)
    
    # NOVOS CAMPOS: Para guardar o token do Google
    google_token = db.Column(db.Text, nullable=True) 
    
    reviews = db.relationship('Review', backref='user', lazy=True)

class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    topic = db.Column(db.String(200), nullable=False)
    date = db.Column(db.String(50), nullable=False)
    cycle = db.Column(db.Integer, default=1)
    last_interval = db.Column(db.Integer, default=0)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'topic': self.topic,
            'date': self.date,
            'cycle': self.cycle,
            'lastInterval': self.last_interval
        }

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- FUNÇÃO AUXILIAR: Criar Evento no Google Agenda ---
def create_google_event(user, topic, iso_date, cycle):
    if not user.google_token:
        return False # Usuário não conectou o Google Agenda
    
    token = json.loads(user.google_token)
    
    # Configura o evento
    event_time = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
    start_str = event_time.isoformat()
    end_str = start_str # Duração padrão de 1h pode ser ajustada, ou evento de dia inteiro

    event_body = {
        'summary': f'Revisão {cycle}: {topic}',
        'description': 'Revisão automática gerada pelo Keka Med Recall.',
        'start': {
            'dateTime': start_str,
            'timeZone': 'America/Recife', # Ajuste o fuso dela se necessário
        },
        'end': {
            'dateTime': start_str, # Se quiser 1h de duração, adicione timedelta aqui
            'timeZone': 'America/Recife',
        },
        'reminders': {
            'useDefault': False,
            'overrides': [
                {'method': 'popup', 'minutes': 10},
            ],
        },
    }

    try:
        # Faz a chamada para a API do Google usando o token salvo
        resp = google.post(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            json=event_body,
            token=token
        )
        return resp.status_code == 200
    except Exception as e:
        print(f"Erro ao agendar: {e}")
        return False

# --- ROTAS PRINCIPAIS ---

@app.route('/')
def home():
    if not current_user.is_authenticated:
        return redirect(url_for('login'))
    
    # Verifica se ela já conectou o Google
    google_connected = current_user.google_token is not None
    return render_template('index.html', name=current_user.name, google_connected=google_connected)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        user = User.query.filter_by(email=email).first()
        if user and check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for('home'))
        else:
            flash('Login inválido.')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email')
        password = request.form.get('password')
        
        if User.query.filter_by(email=email).first():
            flash('Email já cadastrado.')
            return redirect(url_for('register'))
        
        new_user = User(
            name=name, email=email, 
            password=generate_password_hash(password, method='pbkdf2:sha256')
        )
        db.session.add(new_user)
        db.session.commit()
        login_user(new_user)
        return redirect(url_for('home'))
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- ROTAS DO GOOGLE OAUTH ---

@app.route('/connect-google')
@login_required
def connect_google():
    # Manda o usuário para o Google aceitar a permissão
    # prompt='consent' força pedir permissão para garantir que receberemos o refresh token (offline)
    # access_type='offline' é crucial para agendar coisas quando ela não estiver logada no Google na hora
    redirect_uri = url_for('google_callback', _external=True)
    return google.authorize_redirect(redirect_uri, access_type='offline', prompt='consent')

@app.route('/google/callback')
@login_required
def google_callback():
    token = google.authorize_access_token()
    # Salva o token no banco de dados do usuário
    current_user.google_token = json.dumps(token)
    db.session.commit()
    flash('Google Agenda conectado com sucesso! As próximas revisões serão automáticas.')
    return redirect(url_for('home'))

# --- API DE REVISÕES ---

@app.route('/api/reviews', methods=['GET'])
@login_required
def get_reviews():
    user_reviews = Review.query.filter_by(user_id=current_user.id).all()
    return jsonify([r.to_dict() for r in user_reviews])

@app.route('/api/reviews', methods=['POST'])
@login_required
def add_review():
    data = request.json
    new_review = Review(
        topic=data['topic'],
        date=data['date'],
        cycle=data['cycle'],
        last_interval=data.get('lastInterval', 0),
        user_id=current_user.id
    )
    db.session.add(new_review)
    db.session.commit()
    
    # --- AUTOMAÇÃO: Agenda no Google ---
    create_google_event(current_user, new_review.topic, new_review.date, new_review.cycle)

    return jsonify(new_review.to_dict())

@app.route('/api/reviews/<int:id>', methods=['DELETE'])
@login_required
def delete_review(id):
    review = Review.query.filter_by(id=id, user_id=current_user.id).first()
    if review:
        db.session.delete(review)
        db.session.commit()
        # Nota: Deletar do Google Agenda exige salvar o ID do evento do Google. 
        # Por simplicidade, nesta versão v1 não deletamos do Google automaticamente.
        return jsonify({'message': 'Deletado com sucesso'})
    return jsonify({'error': 'Não encontrado'}), 404

# --- INICIALIZAÇÃO ---
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)