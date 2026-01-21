document.addEventListener('DOMContentLoaded', loadReviews);

let currentReviewId = null; 
let reviewsCache = []; // Variável para guardar os dados carregados do servidor

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
        topic: topic,
        date: reviewDate.toISOString(),
        cycle: 1, 
        lastInterval: 0 
    };

    // Envia para o Servidor (Python)
    saveReviewToServer(reviewItem).then(() => {
        // Gera link e abre Google Agenda
        const gCalLink = createGoogleCalendarLink(topic, reviewDate, 1);
        window.open(gCalLink, '_blank');

        topicInput.value = ""; 
        loadReviews(); // Recarrega a lista do servidor
    });
}

// --- Funções do Modal ---
function openCompleteModal(id) {
    currentReviewId = id;
    document.getElementById('modalTotal').value = "";
    document.getElementById('modalAcertos').value = "";
    document.getElementById('modalComplete').classList.remove('hidden');
    document.getElementById('modalTotal').focus();
}

// --- Passo 2: O Cérebro Lógico ---
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
    
    // Busca o item no cache local (que veio do servidor)
    const oldItem = reviewsCache.find(r => r.id === currentReviewId);

    if (oldItem) {
        let diasParaProxima;
        let proximoCiclo = oldItem.cycle + 1;

        // === LÓGICA DA AGENDA ===
        if (oldItem.cycle === 1) {
            if (porcentagem >= 75) diasParaProxima = 28;
            else if (porcentagem >= 50) diasParaProxima = 21;
            else if (porcentagem >= 25) diasParaProxima = 14;
            else diasParaProxima = 7;
        } 
        else {
            const intervaloAnterior = oldItem.lastInterval || 7; 
            let multiplicador;

            if (porcentagem >= 75) multiplicador = 2.0;
            else if (porcentagem >= 50) multiplicador = 1.5;
            else if (porcentagem >= 25) multiplicador = 1.0;
            else multiplicador = 0.5;

            diasParaProxima = Math.ceil(intervaloAnterior * multiplicador);
            if (diasParaProxima < 7) diasParaProxima = 7; 
        }

        const hoje = new Date();
        const novaData = new Date(hoje.getTime() + (diasParaProxima * 24 * 60 * 60 * 1000));

        const newItem = {
            topic: oldItem.topic,
            date: novaData.toISOString(),
            cycle: proximoCiclo,
            lastInterval: diasParaProxima
        };

        // 1. Deleta o antigo no servidor
        deleteReviewFromServer(currentReviewId)
            .then(() => {
                // 2. Cria o novo no servidor
                return saveReviewToServer(newItem);
            })
            .then(() => {
                // 3. Abre Google Agenda e Atualiza Tela
                const gCalLink = createGoogleCalendarLink(newItem.topic, novaData, proximoCiclo);
                window.open(gCalLink, '_blank');

                let msgTempo;
                if (diasParaProxima >= 30) msgTempo = `daqui a ${(diasParaProxima/30).toFixed(1)} meses`;
                else if (diasParaProxima >= 7) msgTempo = `daqui a ${(diasParaProxima/7).toFixed(0)} semanas`;
                else msgTempo = `daqui a ${diasParaProxima} dias`;

                showAlert(`Desempenho: ${porcentagem.toFixed(0)}%\nAgendado: Revisão ${proximoCiclo} para ${msgTempo}.`);
                loadReviews();
            });
    }
}

// --- Funções Padrão ---
function openDeleteModal(id) {
    currentReviewId = id;
    document.getElementById('modalDelete').classList.remove('hidden');
}

function confirmDelete() {
    if (currentReviewId) {
        deleteReviewFromServer(currentReviewId).then(() => {
            closeModal('modalDelete');
            loadReviews();
        });
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

// --- NOVAS FUNÇÕES DE API (Conectam com Python) ---

function loadReviews() {
    const list = document.getElementById('reviewList');
    // Chama o Python para pegar os dados
    fetch('/api/reviews')
        .then(response => response.json())
        .then(reviews => {
            reviewsCache = reviews; // Guarda na memória
            list.innerHTML = "";

            if (reviews.length === 0) {
                list.innerHTML = "<li style='justify-content:center; color:#888;'>Nenhuma revisão pendente.</li>";
                return;
            }

            // Ordena localmente para exibição
            reviews.sort((a, b) => new Date(a.date) - new Date(b.date));

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
        })
        .catch(err => console.error("Erro ao carregar:", err));
}

function saveReviewToServer(item) {
    return fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
    });
}

function deleteReviewFromServer(id) {
    return fetch(`/api/reviews/${id}`, {
        method: 'DELETE'
    });
}

function createGoogleCalendarLink(topic, dateObj, cycle) {
    const start = dateObj.toISOString().replace(/-|:|\.\d\d\d/g, ""); 
    const endObj = new Date(dateObj.getTime() + (1 * 60 * 60 * 1000));
    const end = endObj.toISOString().replace(/-|:|\.\d\d\d/g, "");

    const title = encodeURIComponent(`Revisão ${cycle}: ${topic}`);
    const details = encodeURIComponent("Revisão gerada pelo Keka Med Recall.");
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
}