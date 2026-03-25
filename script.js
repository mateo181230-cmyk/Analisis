// FORMATTING M$
const formatMoney = (amount) => {
    return 'M$ ' + amount.toLocaleString('en-US');
};

// --- CLASSES ---

class Player {
    constructor(name, initialBalance) {
        this.id = 'P' + Math.random().toString(36).substring(2, 6).toUpperCase();
        this.name = name;
        this.balance = initialBalance;
        this.investments = [];
    }

    get investedBalance() {
        return this.investments.reduce((sum, inv) => sum + inv.amount, 0);
    }
}

class Transaction {
    constructor(type, from, to, amount, reason = '') {
        this.id = 'TX' + Date.now();
        this.timestamp = new Date();
        this.type = type; // 'transfer', 'bank-in', 'bank-out', 'invest', 'invest-return', 'system'
        this.from = from; // playerId or 'BANK'
        this.to = to; // playerId or 'BANK'
        this.amount = amount;
        this.reason = reason;
        this.isRevertible = ['transfer', 'bank-in', 'bank-out'].includes(type);
    }
}

class Investment {
    constructor(playerId, amount, type, durationTurns) {
        this.id = 'INV' + Date.now();
        this.playerId = playerId;
        this.amount = amount;
        this.type = type; // 'closed', 'open'
        this.durationTurns = durationTurns;
        this.turnsLeft = durationTurns;
    }

    resolve() {
        if (this.type === 'closed') {
            // Closed: fixed 10% gain per turn
            const rate = 0.10 * this.durationTurns;
            return Math.floor(this.amount * (1 + rate));
        } else {
            // Open: randomized
            // 50% chance -> gain 20%
            // 30% chance -> gain 50%
            // 20% chance -> lose 30%
            const r = Math.random();
            if (r < 0.5) return Math.floor(this.amount * 1.20);
            else if (r < 0.8) return Math.floor(this.amount * 1.50);
            else return Math.floor(this.amount * 0.70);
        }
    }
}

class BankManager {
    constructor() {
        this.players = new Map();
        this.history = [];
        this.investments = [];
        
        // Carga inicial (Opcional, pero se resetea al recargar)
        console.log("Banco Central Monopoly Iniciado");
    }

    addPlayer(name, balance) {
        const p = new Player(name, balance);
        this.players.set(p.id, p);
        return p;
    }

    getPlayer(id) {
        return this.players.get(id);
    }

    // Transactions
    executeTx(type, fromId, toId, amount, reason = '') {
        amount = parseInt(amount, 10);
        if (isNaN(amount) || amount <= 0) throw new Error("Cantidad inválida");

        if (type === 'transfer') {
            if (fromId === toId) throw new Error("No puedes transferirte a ti mismo.");
            const fromP = this.getPlayer(fromId);
            const toP = this.getPlayer(toId);
            if (fromP.balance < amount) throw new Error(`Saldo insuficiente en la cuenta de ${fromP.name}.`);
            
            fromP.balance -= amount;
            toP.balance += amount;
            
        } else if (type === 'bank-in') {
            const fromP = this.getPlayer(fromId);
            if (fromP.balance < amount) throw new Error(`Saldo insuficiente en la cuenta de ${fromP.name}.`);
            fromP.balance -= amount;

        } else if (type === 'bank-out') {
            const toP = this.getPlayer(toId);
            toP.balance += amount;
        }

        const tx = new Transaction(type, fromId, toId, amount, reason);
        this.history.unshift(tx);
        return tx;
    }

    undoLastRevertible() {
        const txIndex = this.history.findIndex(t => t.isRevertible);
        if (txIndex === -1) throw new Error("No hay transacciones para deshacer.");

        const tx = this.history[txIndex];
        
        // Reverse balances
        if (tx.type === 'transfer') {
            const pFrom = this.getPlayer(tx.from);
            const pTo = this.getPlayer(tx.to);
            if (pTo.balance < tx.amount) throw new Error(`No se puede deshacer. ${pTo.name} ya no tiene el saldo que recibió.`);
            pTo.balance -= tx.amount;
            pFrom.balance += tx.amount;
            
        } else if (tx.type === 'bank-in') {
            const pFrom = this.getPlayer(tx.from);
            pFrom.balance += tx.amount;
            
        } else if (tx.type === 'bank-out') {
            const pTo = this.getPlayer(tx.to);
            if (pTo.balance < tx.amount) throw new Error(`No se puede deshacer. ${pTo.name} gastó el dinero recibido.`);
            pTo.balance -= tx.amount;
        }

        // Remove from history
        this.history.splice(txIndex, 1);
        
        // Add log
        const undoTx = new Transaction('system', 'SYS', 'SYS', 0, `Deshecha transacción por M$ ${tx.amount.toLocaleString('en-US')}`);
        undoTx.isRevertible = false;
        this.history.unshift(undoTx);
    }

    invest(playerId, amount, type, turns) {
        amount = parseInt(amount, 10);
        turns = parseInt(turns, 10);
        if (isNaN(amount) || amount <= 0) throw new Error("Cantidad inválida");
        if (isNaN(turns) || turns <= 0) throw new Error("Número de turnos inválido");

        const p = this.getPlayer(playerId);
        if (p.balance < amount) throw new Error(`Saldo insuficiente para invertir M$ ${amount.toLocaleString('en-US')}.`);

        p.balance -= amount; // Freeze money
        const inv = new Investment(playerId, amount, type, turns);
        p.investments.push(inv);
        this.investments.push(inv);

        const typeName = type === 'closed' ? 'Cerrada' : 'Abierta';
        const tx = new Transaction('invest', playerId, 'BANK', amount, `Inversión ${typeName} por ${turns} turnos`);
        tx.isRevertible = false;
        this.history.unshift(tx);
    }

    advanceTurn() {
        let events = [];
        // Decrement turns
        for (let i = this.investments.length - 1; i >= 0; i--) {
            const inv = this.investments[i];
            inv.turnsLeft -= 1;

            if (inv.turnsLeft <= 0) {
                // Resolve
                const p = this.getPlayer(inv.playerId);
                const finalAmount = inv.resolve();
                p.balance += finalAmount;

                const profit = finalAmount - inv.amount;
                const resultText = profit >= 0 ? `Ganancia: +M$${profit.toLocaleString('en-US')}` : `Pérdida: M$${profit.toLocaleString('en-US')}`;
                
                const tx = new Transaction('invest-return', 'BANK', p.id, finalAmount, `Retorno Inversión: ${resultText}`);
                tx.isRevertible = false;
                this.history.unshift(tx);
                events.push({ playerId: p.id, txt: `Inversión resuelta. ${resultText}`});

                // Remove from lists
                p.investments = p.investments.filter(item => item.id !== inv.id);
                this.investments.splice(i, 1);
            }
        }
        return events;
    }
}

// --- UI CONTROLLER ---

const bank = new BankManager();

// DOM Elements
const playersGrid = document.getElementById('players-grid');
const historyList = document.getElementById('history-list');
const btnUndo = document.getElementById('btn-undo');

const modals = {
    addPlayer: document.getElementById('modal-add-player'),
    transaction: document.getElementById('modal-transaction'),
    investment: document.getElementById('modal-investment')
};

// Update UI
function render() {
    // 1. Render Players
    playersGrid.innerHTML = '';
    const playersArray = Array.from(bank.players.values());

    if (playersArray.length === 0) {
        playersGrid.innerHTML = '<p class="empty-state">No hay jugadores activos. Crea uno para empezar.</p>';
    }

    playersArray.forEach(p => {
        const card = document.createElement('div');
        card.className = 'player-card glass-panel';
        
        const invAmount = p.investedBalance;
        
        card.innerHTML = `
            <div class="player-header">
                <span class="player-name">${p.name}</span>
                <span class="player-id">#${p.id}</span>
            </div>
            <div class="balance-group">
                <span class="balance-label">Saldo Disponible</span>
                <span class="balance-amount ${p.balance > 0 ? 'positive' : ''}">${formatMoney(p.balance)}</span>
            </div>
            ${invAmount > 0 ? `
            <div class="balance-group" style="margin-top:10px;">
                <span class="balance-label">Total Congelado (Invertido)</span>
                <span class="balance-amount frozen">🔒 ${formatMoney(invAmount)}</span>
            </div>
            ` : ''}
        `;
        playersGrid.appendChild(card);
    });

    // 2. Render History
    historyList.innerHTML = '';
    if (bank.history.length === 0) {
        historyList.innerHTML = '<li class="history-item empty">Historial vacío.</li>';
    } else {
        bank.history.forEach(tx => {
            const li = document.createElement('li');
            li.className = `history-item ${tx.type}`;
            
            const timeStr = tx.timestamp.toLocaleTimeString();
            let desc = '';
            
            if (tx.type === 'transfer') {
                const pF = bank.getPlayer(tx.from);
                const pT = bank.getPlayer(tx.to);
                desc = `${pF?.name || tx.from} ➔ ${pT?.name || tx.to}`;
            } else if (tx.type === 'bank-in') {
                desc = `${bank.getPlayer(tx.from)?.name} pagó al Banco`;
            } else if (tx.type === 'bank-out') {
                desc = `Banco pagó a ${bank.getPlayer(tx.to)?.name}`;
            } else if (tx.type === 'system') {
                desc = tx.reason;
            } else {
                // Invest / Invest return
                desc = `${bank.getPlayer(tx.from || tx.to)?.name || ''} - ${tx.reason}`;
            }

            li.innerHTML = `
                <span class="tx-time">${timeStr}</span>
                <div style="display:flex; justify-content:space-between;">
                    <span>${desc}</span>
                    <span class="tx-amount ${tx.type === 'bank-in' || tx.type === 'invest' ? 'text-red' : (tx.type === 'system' ? '' : 'text-green')}">
                        ${tx.amount > 0 ? formatMoney(tx.amount) : ''}
                    </span>
                </div>
            `;
            historyList.appendChild(li);
        });
    }

    // 3. Update Undo Button (Only true if there is at least one revertible and it is the FIRST found revertible)
    const hasRevertible = bank.history.some(tx => tx.isRevertible);
    btnUndo.disabled = !hasRevertible;
}

// Show/Hide Modals
document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.add('hidden');
    });
});
function showModal(id) {
    modals[id].classList.remove('hidden');
}
function hideModal(id) {
    modals[id].classList.add('hidden');
}

// Modals Populators
function populateSelects(selectElements) {
    const players = Array.from(bank.players.values());
    selectElements.forEach(select => {
        if (!select) return;
        select.innerHTML = '';
        players.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} (${formatMoney(p.balance)})`;
            select.appendChild(opt);
        });
    });
}

// --- EVENT LISTENERS ---

// Add Player
document.getElementById('btn-add-player').addEventListener('click', () => showModal('addPlayer'));
document.getElementById('form-add-player').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('input-player-name').value;
    const bal = document.getElementById('input-player-balance').value;
    bank.addPlayer(name, parseInt(bal, 10));
    e.target.reset();
    hideModal('addPlayer');
    render();
});

// Dataphone Actions setup
document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        const playersCount = bank.players.size;
        
        if (playersCount === 0) {
            alert("Primero debes crear jugadores.");
            return;
        }

        if (action === 'invest') {
            populateSelects([document.getElementById('select-inv-player')]);
            showModal('investment');
            return;
        }

        // Transactions
        const txTypeInput = document.getElementById('tx-type');
        const titleEl = document.getElementById('transaction-title');
        const fgFrom = document.getElementById('fg-from');
        const fgTo = document.getElementById('fg-to');
        
        const selFrom = document.getElementById('select-tx-from');
        const selTo = document.getElementById('select-tx-to');

        txTypeInput.value = action;
        document.getElementById('input-tx-amount').value = '';

        if (action === 'transfer') {
            if (playersCount < 2) {
                alert("Necesitas al menos 2 jugadores para realizar una transferencia entre ellos.");
                return;
            }
            titleEl.textContent = '🔁 Transferir';
            fgFrom.style.display = 'block';
            fgTo.style.display = 'block';
            populateSelects([selFrom, selTo]);
            selFrom.required = true;
            selTo.required = true;
            
        } else if (action === 'pay-bank') {
            titleEl.textContent = '🏦 Pagar al Banco';
            fgFrom.style.display = 'block';
            fgTo.style.display = 'none';
            populateSelects([selFrom]);
            selFrom.required = true;
            selTo.required = false;

        } else if (action === 'receive-bank') {
            titleEl.textContent = '💰 Recibir del Banco';
            fgFrom.style.display = 'none';
            fgTo.style.display = 'block';
            populateSelects([selTo]);
            selFrom.required = false;
            selTo.required = true;
        }

        showModal('transaction');
    });
});

// Submit Transaction
document.getElementById('form-transaction').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = document.getElementById('tx-type').value;
    const fromId = document.getElementById('select-tx-from').value;
    const toId = document.getElementById('select-tx-to').value;
    const amount = document.getElementById('input-tx-amount').value;

    try {
        bank.executeTx(type, type==='receive-bank'?'BANK':fromId, type==='pay-bank'?'BANK':toId, amount);
        hideModal('transaction');
        render();
    } catch (err) {
        alert(err.message);
    }
});

// Investment Type Description changes
document.getElementById('select-inv-type').addEventListener('change', (e) => {
    const desc = document.getElementById('inv-desc');
    if (e.target.value === 'closed') {
        desc.className = "help-text text-green";
        desc.textContent = "🟢 SEGURO: Gana una rentabilidad fija equivalente a +10% del capital por cada turno invertido.";
    } else {
        desc.className = "help-text text-red";
        desc.textContent = "🔴 ALTO RIESGO: 50% Gana 20%, 30% Gana 50%, o 20% Pierde el 30% (Sin importar los turnos).";
    }
});

// Submit Investment
document.getElementById('form-investment').addEventListener('submit', (e) => {
    e.preventDefault();
    const pId = document.getElementById('select-inv-player').value;
    const type = document.getElementById('select-inv-type').value;
    const amount = document.getElementById('input-inv-amount').value;
    const turns = document.getElementById('input-inv-turns').value;

    try {
        bank.invest(pId, amount, type, turns);
        e.target.reset();
        hideModal('investment');
        
        // Reset description text color and string just in case
        document.getElementById('inv-desc').className = "help-text text-green";
        document.getElementById('inv-desc').textContent = "🟢 SEGURO: Gana una rentabilidad fija equivalente a +10% del capital por cada turno invertido.";
        
        render();
    } catch (err) {
        alert(err.message);
    }
});

// Advance Turn
document.getElementById('btn-next-turn').addEventListener('click', () => {
    if (bank.players.size === 0) {
        alert("Agrega jugadores para empezar a jugar y turnarse.");
        return;
    }
    
    // Animate button
    const btn = document.getElementById('btn-next-turn');
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 300);

    const events = bank.advanceTurn();
    if (events.length > 0) {
        alert('🔔 Resultados de Inversiones:\n\n' + events.map(e => `👤 ${bank.getPlayer(e.playerId).name}: ${e.txt}`).join('\n'));
    }
    render();
});

// Undo
btnUndo.addEventListener('click', () => {
    try {
        bank.undoLastRevertible();
        render();
    } catch(err) {
        alert(err.message);
    }
});

// Initial Render
render();
