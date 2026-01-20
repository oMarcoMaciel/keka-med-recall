document.addEventListener('DOMContentLoaded', loadReviews);

// --- Passo 1: Agendar Teoria Inicial ---
function scheduleReview(hours) {
    const topicInput = document.getElementById('topicInput');
    const topic = topicInput.value;

    if (!topic) {
        alert("Por favor, digite o tema estudado!");
        return;
    }

    // Define a data (Agora + horas escolhidas)
    const now = new Date();
    const reviewDate = new Date(now.getTime() + (hours * 60 * 60 * 1000));

    // Cria o objeto de dados
    const reviewItem = {
        id: Date.now(),
        topic: topic,
        date: reviewDate.toISOString(),
        cycle: 1 // Ciclo 1 = Primeira revisão
    };

    saveReview(reviewItem);
    
    // Abre o Google Agenda
    const gCalLink = createGoogleCalendarLink(topic, reviewDate);
    window.open(gCalLink, '_blank');

    topicInput.value = ""; 
    loadReviews(); 
}

// --- Passo 2: Completar e Recalcular ---
function completeReview(id) {
    let input = prompt("Quantas questões acertaste? (0 a 40)");
    
    if (input === null || input === "") return;
    
    let acertos = parseInt(input);
    if (isNaN(acertos) || acertos < 0 || acertos > 40) {
        alert("Valor inválido. Insira entre 0 e 40.");
        return;
    }

    let reviews = JSON.parse(localStorage.getItem('medReviews')) || [];
    const itemIndex = reviews.findIndex(r => r.id === id);
    
    if (itemIndex > -1) {
        const oldItem = reviews[itemIndex];
        
        // --- ALGORITMO DE REPETIÇÃO ESPAÇADA ---
        let diasParaProxima;
        
        if (acertos >= 40) {
            diasParaProxima = 28; // 4 semanas
        } else if (acertos >= 30) {
            diasParaProxima = 21; // 3 semanas
        } else if (acertos >= 20) {
            diasParaProxima = 14; // 2 semanas
        } else if (acertos >= 10) {
            diasParaProxima = 7;  // 1 semana
        } else {
            diasParaProxima = 1;  // Errou muito? Revisão amanhã.
        }

        const hoje = new Date();
        const novaData = new Date(hoje.getTime() + (diasParaProxima * 24 * 60 * 60 * 1000));

        const newItem = {
            id: Date.now(),
            topic: oldItem.topic,
            date: novaData.toISOString(),
            cycle: oldItem.cycle + 1
        };

        // Atualiza a lista: remove o antigo, adiciona o novo
        reviews.splice(itemIndex, 1);
        reviews.push(newItem);
        reviews.sort((a, b) => new Date(a.date) - new Date(b.date));
        localStorage.setItem('medReviews', JSON.stringify(reviews));

        // Agenda o próximo no Google
        const gCalLink = createGoogleCalendarLink(newItem.topic, novaData);
        window.open(gCalLink, '_blank');

        loadReviews();
    }
}

// --- Funções Utilitárias ---

function saveReview(item) {
    let reviews = JSON.parse(localStorage.getItem('medReviews')) || [];
    reviews.push(item);
    // Ordena para mostrar o mais urgente primeiro
    reviews.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem('medReviews', JSON.stringify(reviews));
}

function createGoogleCalendarLink(topic, dateObj) {
    // Formata data para YYYYMMDDTHHmmssZ (UTC)
    const start = dateObj.toISOString().replace(/-|:|\.\d\d\d/g, ""); 
    const endObj = new Date(dateObj.getTime() + (1 * 60 * 60 * 1000)); // Duração de 1h
    const end = endObj.toISOString().replace(/-|:|\.\d\d\d/g, "");

    const title = encodeURIComponent(`Revisão: ${topic}`);
    const details = encodeURIComponent("Revisão gerada pelo Keka Med Recall.");
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
}

function loadReviews() {
    const list = document.getElementById('reviewList');
    list.innerHTML = "";
    
    const reviews = JSON.parse(localStorage.getItem('medReviews')) || [];

    if (reviews.length === 0) {
        list.innerHTML = "<li style='justify-content:center; color:#888;'>Nenhuma revisão pendente.</li>";
        return;
    }

    reviews.forEach(review => {
        const dateObj = new Date(review.date);
        const dateString = dateObj.toLocaleDateString('pt-BR');
        
        // Se a data já passou, pinta de vermelho
        const hoje = new Date();
        const isLate = dateObj < hoje;
        const colorStyle = isLate ? "border-left: 4px solid #ef4444;" : "border-left: 4px solid #10b981;";

        const li = document.createElement('li');
        li.style = colorStyle;
        li.innerHTML = `
            <div class="review-info">
                <strong>${review.topic}</strong>
                <span>${dateString} • Ciclo ${review.cycle}</span>
            </div>
            <button onclick="completeReview(${review.id})" class="btn-check">
                ✅ Feito
            </button>
        `;
        list.appendChild(li);
    });
}