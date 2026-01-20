document.addEventListener('DOMContentLoaded', loadReviews);

let currentReviewId = null; 

// --- Passo 1: Agendar Teoria ---
function scheduleReview(hours) {
    const topicInput = document.getElementById('topicInput');
    const topic = topicInput.value;

    if (!topic) {
        showAlert("Por favor, digite o tema estudado!");
        return;
    }

    const now = new Date();
    // Agenda a 1ª Revisão Prática (Ciclo 1)
    const reviewDate = new Date(now.getTime() + (hours * 60 * 60 * 1000));

    const reviewItem = {
        id: Date.now(),
        topic: topic,
        date: reviewDate.toISOString(),
        cycle: 1, // Essa é a primeira revisão
        lastInterval: 0 
    };

    saveReview(reviewItem);
    
    // Google Agenda (Passamos o ciclo 1 fixo aqui)
    const gCalLink = createGoogleCalendarLink(topic, reviewDate, 1);
    window.open(gCalLink, '_blank');

    topicInput.value = ""; 
    loadReviews(); 
}

// --- Funções do Modal ---
function openCompleteModal(id) {
    currentReviewId = id;
    document.getElementById('modalTotal').value = "";
    document.getElementById('modalAcertos').value = "";
    document.getElementById('modalComplete').classList.remove('hidden');
    document.getElementById('modalTotal').focus();
}

// --- Passo 2: O Cérebro do App ---
function confirmComplete() {
    const totalInput = document.getElementById('modalTotal').value;
    const acertosInput = document.getElementById('modalAcertos').value;

    if (!totalInput || !acertosInput) {
        showAlert("Preencha todos os campos!");
        return;
    }

    const total = parseInt(totalInput);
    const acertos = parseInt(acertosInput);

    if (total <= 0 || acertos < 0 || acertos > total) {
        showAlert("Números inválidos.");
        return;
    }

    closeModal('modalComplete');

    const porcentagem = (acertos / total) * 100;
    
    let reviews = JSON.parse(localStorage.getItem('medReviews')) || [];
    const itemIndex = reviews.findIndex(r => r.id === currentReviewId);

    if (itemIndex > -1) {
        const oldItem = reviews[itemIndex];
        let diasParaProxima;
        
        // Calcula qual será o próximo número da revisão (ex: se era 1, vira 2)
        let proximoCiclo = oldItem.cycle + 1;

        // === LÓGICA DA AGENDA ===
        
        // CENÁRIO A: Ciclo 1 -> Ciclo 2 (Usa Tabela Fixa)
        if (oldItem.cycle === 1) {
            if (porcentagem >= 75) diasParaProxima = 28;      // 4 semanas
            else if (porcentagem >= 50) diasParaProxima = 21; // 3 semanas
            else if (porcentagem >= 25) diasParaProxima = 14; // 2 semanas
            else diasParaProxima = 7;                         // 1 semana
        } 
        
        // CENÁRIO B: Ciclos Futuros (Usa Multiplicador)
        else {
            const intervaloAnterior = oldItem.lastInterval; 
            let multiplicador;

            if (porcentagem >= 75) multiplicador = 2.0;       // Dobra
            else if (porcentagem >= 50) multiplicador = 1.5;  // +50%
            else if (porcentagem >= 25) multiplicador = 1.0;  // Mantém
            else multiplicador = 0.5;                         // Reduz

            diasParaProxima = Math.ceil(intervaloAnterior * multiplicador);
            if (diasParaProxima < 7) diasParaProxima = 7; 
        }

        // --- Salvar e Agendar ---
        const hoje = new Date();
        const novaData = new Date(hoje.getTime() + (diasParaProxima * 24 * 60 * 60 * 1000));

        const newItem = {
            id: Date.now(),
            topic: oldItem.topic,
            date: novaData.toISOString(),
            cycle: proximoCiclo,
            lastInterval: diasParaProxima
        };

        reviews.splice(itemIndex, 1);
        reviews.push(newItem);
        reviews.sort((a, b) => new Date(a.date) - new Date(b.date));
        localStorage.setItem('medReviews', JSON.stringify(reviews));

        // Aqui passamos o "proximoCiclo" para o título ficar correto
        const gCalLink = createGoogleCalendarLink(newItem.topic, novaData, proximoCiclo);
        window.open(gCalLink, '_blank');

        // Texto do feedback
        let msgTempo;
        if (diasParaProxima >= 30) msgTempo = `daqui a ${(diasParaProxima/30).toFixed(1)} meses`;
        else if (diasParaProxima >= 7) msgTempo = `daqui a ${(diasParaProxima/7).toFixed(0)} semanas`;
        else msgTempo = `daqui a ${diasParaProxima} dias`;

        showAlert(`Desempenho: ${porcentagem.toFixed(0)}%\nAgendado: Revisão ${proximoCiclo} para ${msgTempo}.`);
        
        loadReviews();
    }
}

// --- Funções Padrão ---
function openDeleteModal(id) {
    currentReviewId = id;
    document.getElementById('modalDelete').classList.remove('hidden');
}

function confirmDelete() {
    if (currentReviewId) {
        let reviews = JSON.parse(localStorage.getItem('medReviews')) || [];
        reviews = reviews.filter(r => r.id !== currentReviewId);
        localStorage.setItem('medReviews', JSON.stringify(reviews));
        closeModal('modalDelete');
        loadReviews();
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function showAlert(message) {
    document.getElementById('alertMessage').innerText = message;
    document.getElementById('modalAlert').classList.remove('hidden');
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.classList.add('hidden');
    }
}

function saveReview(item) {
    let reviews = JSON.parse(localStorage.getItem('medReviews')) || [];
    reviews.push(item);
    reviews.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem('medReviews', JSON.stringify(reviews));
}

// --- ATUALIZADO: Agora recebe o parâmetro 'cycle' ---
function createGoogleCalendarLink(topic, dateObj, cycle) {
    const start = dateObj.toISOString().replace(/-|:|\.\d\d\d/g, ""); 
    const endObj = new Date(dateObj.getTime() + (1 * 60 * 60 * 1000));
    const end = endObj.toISOString().replace(/-|:|\.\d\d\d/g, "");

    // Título dinâmico: Revisão 1: Cardiologia
    const title = encodeURIComponent(`Revisão ${cycle}: ${topic}`);
    
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
            <div class="actions">
                <button onclick="openCompleteModal(${review.id})" class="btn-check">✅</button>
                <button onclick="openDeleteModal(${review.id})" class="btn-delete">🗑️</button>
            </div>
        `;
        list.appendChild(li);
    });
}