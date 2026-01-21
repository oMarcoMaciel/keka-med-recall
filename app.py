from flask import Flask, render_template, redirect, url_for, request, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'chave-secreta-keka' 
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///keka_recall.db'
db = SQLAlchemy(app)

# --- Login Setup ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- Modelos ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)
    reviews = db.relationship('Review', backref='user', lazy=True)

class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    topic = db.Column(db.String(200), nullable=False)
    date = db.Column(db.String(50), nullable=False)
    cycle = db.Column(db.Integer, default=1)
    last_interval = db.Column(db.Integer, default=0)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Função auxiliar para transformar o objeto do banco em JSON
    def to_dict(self):
        return {
            'id': self.id,
            'topic': self.topic,
            'date': self.date,
            'cycle': self.cycle,
            'lastInterval': self.last_interval # Convertendo snake_case para camelCase pro JS
        }

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- Rotas de Páginas ---

@app.route('/')
def home():
    if not current_user.is_authenticated:
        return redirect(url_for('login'))
    return render_template('index.html', name=current_user.name)

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
            flash('Login inválido. Verifique email e senha.')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email')
        password = request.form.get('password')
        
        user_exists = User.query.filter_by(email=email).first()
        if user_exists:
            flash('Este email já está cadastrado!')
            return redirect(url_for('register'))
        
        new_user = User(
            name=name, 
            email=email, 
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

# --- API (O Cérebro que conecta com o JS) ---

@app.route('/api/reviews', methods=['GET'])
@login_required
def get_reviews():
    # Pega APENAS as revisões do usuário atual
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
        user_id=current_user.id # Vincula ao usuário logado
    )
    db.session.add(new_review)
    db.session.commit()
    return jsonify(new_review.to_dict())

@app.route('/api/reviews/<int:id>', methods=['DELETE'])
@login_required
def delete_review(id):
    # Tenta encontrar a revisão, mas garante que pertence ao usuário
    review = Review.query.filter_by(id=id, user_id=current_user.id).first()
    if review:
        db.session.delete(review)
        db.session.commit()
        return jsonify({'message': 'Deletado com sucesso'})
    return jsonify({'error': 'Não encontrado'}), 404

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)