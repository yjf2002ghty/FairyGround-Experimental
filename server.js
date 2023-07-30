const express = require('express');
const app = express();
const WebSocket = require('ws');
const { spawn } = require('child_process');
const os = require('os');
const WebSocketServer = WebSocket.Server;
const port = 5000;

console.log("============================================");
console.log("             SECURITY WARNING");
console.log("============================================");
console.log("This backend does not check the input from the frontend. The client user can enter anything as the command, which can pose threat to your server security. Therefore you should only allow trusted users to connect.\n\n");

app.use(function (req, res, next) {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});

app.use('/public', express.static('public'));

app.all('/', function (req, res) {
    console.log("[HTTP Server] Redirect to index page.");
    res.redirect("/public/index.html");
})

const httpserver = app.listen(port, function () {
    var host = httpserver.address().address;
    var port = httpserver.address().port;
    console.log("[HTTP Server] Server is up at http://localhost:%s", port);
})

const LoadEngineTimeout = 10000;
const EngineProtocols = ["UCI", "USI", "UCCI", "UCI_CYCLONE"];

function noop() { }

function heartbeat() {
    this.isAlive = true;
}

const wss = new WebSocketServer({ port: port + 1 }, () => {
    console.log("[WebSocket Server] Server is up at ws://localhost:%s", port + 1);
});

var ClientEngines = new Map();
var ConnectingClients = new Set();
var ConnectedClients = new Set();

wss.on('connection', (ws, req) => {
    console.log('[WebSocket Server] Received connection from client.');
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    ws.on('message', (message) => {
        let msg = message.toString().split('|');
        if (msg[0] == "CONNECT") {
            if (ConnectingClients.has(ws) || ConnectedClients.has(ws)) {
                console.warn("[WebSocket Server] Received connection request from connecting or connected client.");
            }
            console.log(`[WebSocket Server] Client connection verification code is ${msg[1]}.`);
            ws.send(msg[1], (err) => {
                if (err) {
                    console.log(`[WebSocket Server] error: ${err}`);
                }
            });
            ConnectingClients.add(ws);
        }
        else if (msg[0] == "READYOK") {
            if (ConnectingClients.has(ws) && !ConnectedClients.has(ws)) {
                console.log(`[WebSocket Server] Client connected.`);
                ConnectedClients.add(ws);
                ConnectingClients.delete(ws);
            }
            else {
                console.warn("[WebSocket Server] Received connection ready mark from connected or unknown client.");
            }
        }
        else {
            if (!ConnectedClients.has(ws)) {
                console.warn(`[WebSocket Server] Received bad data from client when connection established: ${message.toString()}`);
                ws.close();
                return;
            }
        }
        if (msg[0] == "LOAD_ENGINE") {
            if (msg.length != 5) {
                console.warn("[WebSocket Server] Received bad data from client. Syntax: LOAD_ENGINE|<PATH TO ENGINE WHITE>|<PATH TO ENGINE BLACK>|<ENGINE WHITE PROTOCOL>|<ENGINE BLACK PROTOCOL>.");
                return;
            }
            if (!EngineProtocols.includes(msg[3]) || !EngineProtocols.includes(msg[4])) {
                console.warn("[WebSocket Server] Received bad engine protocol from client. Available protocols are:\n", EngineProtocols);
                return;
            }
            if (ClientEngines.has(ws)) {
                let ClientEngine = ClientEngines.get(ws);
                if (ClientEngine.exeStatusW == "LOADING" || ClientEngine.exeStatusB == "LOADING") {
                    console.warn("[WebSocket Server] Loading engine.");
                    return;
                }
                ClientEngines.set(ws, { connection: ws, white: null, black: null, exeStatusW: null, exeStatusB: null, isReloadingWhite: false, isReloadingBlack: false, exePathW: msg[1], exePathB: msg[2], protocolW: msg[3], protocolB: msg[4] });
                if (ClientEngine.white != null) {
                    ClientEngines.get(ws).isReloadingWhite = true;
                    if (os.type() == 'Windows_NT') {
                        spawn('taskkill', ['/pid', ClientEngine.white.pid, '/f', '/t']);  //New Engine will be loaded in onclose function of this child process
                    }
                    else {
                        ClientEngine.white.kill('SIGKILL');
                    }
                }
                else {
                    LoadEngineWhite(ws, msg, false);
                }
                if (ClientEngine.black != null) {
                    ClientEngines.get(ws).isReloadingBlack = true;
                    if (os.type() == 'Windows_NT') {
                        spawn('taskkill', ['/pid', ClientEngine.black.pid, '/f', '/t']);  //New Engine will be loaded in onclose function of this child process
                    }
                    else {
                        ClientEngine.black.kill('SIGKILL');
                    }
                }
                else {
                    LoadEngineBlack(ws, msg, false);
                }
            }
            else {
                ClientEngines.set(ws, { connection: ws, white: null, black: null, exeStatusW: null, exeStatusB: null, isReloadingWhite: false, isReloadingBlack: false, exePathW: msg[1], exePathB: msg[2], protocolW: msg[3], protocolB: msg[4] });
                LoadEngine(ws, msg, false);
            }
        }
        else if (msg[0] == "POST_MSG") {
            if ((msg[1] != "WHITE" && msg[1] != "BLACK") || msg.length != 3) {
                console.warn("[WebSocket Server] Received bad data from client. Syntax: POST_MSG|<WHITE|BLACK>|<info...>.");
                return;
            }
            if (ClientEngines.has(ws)) {
                let ClientEngine = ClientEngines.get(ws);
                if (ClientEngine.white != null && msg[1] == "WHITE") {
                    ClientEngine.white.stdin.write(msg[2] + "\n");
                }
                if (ClientEngine.black != null && msg[1] == "BLACK") {
                    ClientEngine.black.stdin.write(msg[2] + "\n");
                }
            }
            else {
                console.warn("[WebSocket Server] Client has not loaded any engine.");
                return;
            }
        }
        else if (msg[0] == "ENGINE_READY") {
            if ((msg[1] != "WHITE" && msg[1] != "BLACK") || msg.length != 2) {
                console.warn("[WebSocket Server] Received bad data from client. Syntax: ENGINE_READY|<WHITE|BLACK>.");
                return;
            }
            if (msg[1] == "WHITE") {
                console.log("[WebSocket Server] White Engine is ready.");
                let ClientEngine = ClientEngines.get(ws);
                ClientEngine.exeStatusW = "LOADED";
            }
            else if (msg[1] == "BLACK") {
                console.log("[WebSocket Server] Black Engine is ready.");
                let ClientEngine = ClientEngines.get(ws);
                ClientEngine.exeStatusB = "LOADED";
            }
        }
    });
    ws.on("close", (ws) => {
        console.log(`[WebSocket Server] Client disconnected.`);
        ClientEngines.forEach(function each(value, key) {
            if (!wss.clients.has(key)) {
                let ClientEngine = ClientEngines.get(key);
                if (ClientEngine.white != null) {
                    if (os.type() == 'Windows_NT') {
                        spawn('taskkill', ['/pid', ClientEngine.white.pid, '/f', '/t']);
                    }
                    else {
                        ClientEngine.white.kill('SIGKILL');
                    }
                }
                if (ClientEngine.black != null) {
                    if (os.type() == 'Windows_NT') {
                        spawn('taskkill', ['/pid', ClientEngine.black.pid, '/f', '/t']);
                    }
                    else {
                        ClientEngine.black.kill('SIGKILL');
                    }
                }
                ClientEngines.delete(key);
            }
        });
        ConnectedClients.forEach(function each(value, value2) {
            if (!wss.clients.has(value)) {
                ConnectedClients.delete(value);
            }
        });
        ConnectingClients.forEach(function each(value, value2) {
            if (!wss.clients.has(value)) {
                ConnectingClients.delete(value);
            }
        });
    })
});

wss.on("close", (ws) => {
    console.log(`[WebSocket Server] Shutting Down!`);
})

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping(noop);
    });
}, 30000);


function LoadEngine(ws, msg, reloading_engine) {
    LoadEngineWhite(ws, msg, reloading_engine);
    LoadEngineBlack(ws, msg, reloading_engine);
}

function LoadEngineWhite(ws, msg, reloading_engine) {
    let engineW = null;
    let engineB = null;
    let exeStatusB = null;
    let reloading_engine_black = false;
    let exePathB = null;
    let protocolB = null;
    let ClientEngine = null;
    if (ClientEngines.has(ws)) {
        ClientEngine = ClientEngines.get(ws);
        engineB = ClientEngine.black;
        exeStatusB = ClientEngine.exeStatusB;
        reloading_engine_black = ClientEngine.isReloadingBlack;
        exePathB = ClientEngine.exePathB;
        protocolB = ClientEngine.protocolB;
    }
    else {
        console.error("[WebSocket Server] Cannot find engine details in map.");
        return;
    }
    if (os.type() == 'Windows_NT') {
        if (ClientEngine.exePathW != "") {
            engineW = spawn('cmd.exe', ['/C', ClientEngine.exePathW]);
            engineW.on('error', (err) => {
                console.error('[WebSocket Server] Failed to load White Engine: ', err);
                ws.send("ERROR|LOAD_ENGINE|WHITE");
                return;
            });
            //There are 4 kinds of close:
            //1. Shell immediately closed after spawned. This indicates an error.
            //2. Shell terminated during reloading engine (when user has already loaded engine before.). This is not an error.
            //3. Shell terminated when client disconnects. Not an error.
            //4. Shell terminated when engine load timed out. Not an error.
            engineW.on('close', (code) => {
                if (wss.clients.has(ws)) {
                    if (ClientEngines.has(ws)) {
                        if (ClientEngines.get(ws).exeStatusW == "TIMEOUT") {
                            console.error("[WebSocket Server] Engine WHITE load timed out.");
                            ws.send("ERROR|ENGINE_TIMEOUT|WHITE");
                            ClientEngines.get(ws).isReloadingWhite = false;
                            ClientEngines.get(ws).white = null;
                            ClientEngines.get(ws).exeStatusW = null;
                            return;
                        }
                        if (!ClientEngines.get(ws).isReloadingWhite) {
                            console.error('[WebSocket Server] Failed to load White Engine: ', code);
                            ws.send("ERROR|LOAD_ENGINE|WHITE");
                            ClientEngines.get(ws).isReloadingWhite = false;
                            ClientEngines.get(ws).white = null;
                            ClientEngines.get(ws).exeStatusW = null;
                            return;
                        }
                        ClientEngines.get(ws).isReloadingWhite = false;
                        LoadEngineWhite(ws, msg, false);
                    }
                }
            });
            engineW.stdout.on('data', (data) => {
                ws.send("ENGINE_INFO|WHITE|" + data);
            });
            engineW.stderr.on('data', (data) => {
                ws.send("ENGINE_ERROR|WHITE|" + data);
            });
            console.log("[WebSocket Server] Engine ", ClientEngine.exePathW.split(/[/\\]/).at(-1).trim(), " loading for white.");
            console.log("[WebSocket Server] Engine protocol is " + ClientEngine.protocolW);
            if (ClientEngine.protocolW == "UCI" || ClientEngine.protocolW == "UCI_CYCLONE") {
                engineW.stdin.write("uci\n");
            }
            else if (ClientEngine.protocolW == "USI") {
                engineW.stdin.write("usi\n");
            }
            else if (ClientEngine.protocolW == "UCCI") {
                engineW.stdin.write("ucci\n");
            }
        }
    }
    else if (os.type() == 'Darwin' || os.type() == 'Linux') {
        if (ClientEngine.exePathW != "") {
            engineW = spawn('bash', [ClientEngine.exePathW]);
            engineW.on('error', (err) => {
                console.error('[WebSocket Server] Failed to load White Engine: ', err);
                ws.send("ERROR|LOAD_ENGINE|WHITE");
                return;
            });
            engineW.on('close', (code) => {
                if (wss.clients.has(ws)) {
                    if (ClientEngines.has(ws)) {
                        if (ClientEngines.get(ws).exeStatusW == "TIMEOUT") {
                            console.error("[WebSocket Server] Engine WHITE load timed out.");
                            ws.send("ERROR|ENGINE_TIMEOUT|WHITE");
                            ClientEngines.get(ws).isReloadingWhite = false;
                            ClientEngines.get(ws).white = null;
                            ClientEngines.get(ws).exeStatusW = null;
                            return;
                        }
                        if (!ClientEngines.get(ws).isReloadingWhite) {
                            console.error('[WebSocket Server] Failed to load White Engine: ', code);
                            ws.send("ERROR|LOAD_ENGINE|WHITE");
                            ClientEngines.get(ws).isReloadingWhite = false;
                            ClientEngines.get(ws).white = null;
                            ClientEngines.get(ws).exeStatusW = null;
                            return;
                        }
                        ClientEngines.get(ws).isReloadingWhite = false;
                        LoadEngineWhite(ws, msg, false);
                    }
                }
            });
            engineW.stdout.on('data', (data) => {
                ws.send("ENGINE_INFO|WHITE|" + data);
            });
            engineW.stderr.on('data', (data) => {
                ws.send("ENGINE_ERROR|WHITE|" + data);
            });
            console.log("[WebSocket Server] Engine ", ClientEngine.exePathW.split('/').at(-1).replace(/\"/g, "").trim(), " loading for white.");
            console.log("[WebSocket Server] Engine protocol is " + ClientEngine.protocolW);
            if (ClientEngine.protocolW == "UCI" || ClientEngine.protocolW == "UCI_CYCLONE") {
                engineW.stdin.write("uci\n");
            }
            else if (ClientEngine.protocolW == "USI") {
                engineW.stdin.write("usi\n");
            }
            else if (ClientEngine.protocolW == "UCCI") {
                engineW.stdin.write("ucci\n");
            }
        }
    }
    else {
        console.log(`[WebSocket Server] Unknown server OS: ${os.type()}.`);
        return;
    }
    if (engineW == null) {
        return;
    }
    ClientEngines.set(ws, { connection: ws, white: engineW, black: engineB, exeStatusW: "LOADING", exeStatusB: exeStatusB, isReloadingWhite: reloading_engine, isReloadingBlack: reloading_engine_black, exePathW: ClientEngine.exePathW, exePathB: exePathB, protocolW: ClientEngine.protocolW, protocolB: protocolB });
    setTimeout(() => {
        if (ClientEngines.get(ws).exeStatusW == "LOADING") {
            ClientEngines.get(ws).exeStatusW = "TIMEOUT";
            if (os.type() == 'Windows_NT') {
                spawn('taskkill', ['/pid', ClientEngines.get(ws).white.pid, '/f', '/t']);
            }
            else {
                ClientEngines.get(ws).white.kill('SIGKILL');
            }
        }
    }, LoadEngineTimeout);
}

function LoadEngineBlack(ws, msg, reloading_engine) {
    let engineW = null;
    let engineB = null;
    let exeStatusW = null;
    let reloading_engine_white = false;
    let exePathW = null;
    let protocolW = null;
    let ClientEngine = null;
    if (ClientEngines.has(ws)) {
        ClientEngine = ClientEngines.get(ws);
        engineW = ClientEngine.white;
        exeStatusW = ClientEngine.exeStatusW;
        reloading_engine_white = ClientEngine.isReloadingWhite;
        exePathW = ClientEngine.exePathW;
        protocolW = ClientEngine.protocolW;
    }
    else {
        console.error("[WebSocket Server] Cannot find engine details in map.");
        return;
    }
    if (os.type() == 'Windows_NT') {
        if (ClientEngine.exePathB != "") {
            engineB = spawn('cmd.exe', ['/C', ClientEngine.exePathB]);
            engineB.on('error', (err) => {
                console.error('[WebSocket Server] Failed to load Black Engine: ', err);
                ws.send("ERROR|LOAD_ENGINE|BLACK");
                return;
            });
            engineB.on('close', (code) => {
                if (wss.clients.has(ws)) {
                    if (ClientEngines.has(ws)) {
                        if (ClientEngines.get(ws).exeStatusB == "TIMEOUT") {
                            console.error("[WebSocket Server] Engine BLACK load timed out.");
                            ws.send("ERROR|ENGINE_TIMEOUT|BLACK");
                            ClientEngines.get(ws).isReloadingBlack = false;
                            ClientEngines.get(ws).black = null;
                            ClientEngines.get(ws).exeStatusB = null;
                            return;
                        }
                        if (!ClientEngines.get(ws).isReloadingBlack) {
                            console.error('[WebSocket Server] Failed to load Black Engine: ', code);
                            ws.send("ERROR|LOAD_ENGINE|BLACK");
                            ClientEngines.get(ws).isReloadingBlack = false;
                            ClientEngines.get(ws).black = null;
                            ClientEngines.get(ws).exeStatusB = null;
                            return;
                        }
                        ClientEngines.get(ws).isReloadingBlack = false;
                        LoadEngineBlack(ws, msg, false);
                    }
                }
            });
            engineB.stdout.on('data', (data) => {
                ws.send("ENGINE_INFO|BLACK|" + data);
            });
            engineB.stderr.on('data', (data) => {
                ws.send("ENGINE_ERROR|BLACK|" + data);
            });
            console.log("[WebSocket Server] Engine ", ClientEngine.exePathB.split(/[/\\]/).at(-1).replace(/\"/g, "").trim(), " loading for black.");
            console.log("[WebSocket Server] Engine protocol is " + ClientEngine.protocolB);
            if (ClientEngine.protocolB == "UCI" || ClientEngine.protocolB == "UCI_CYCLONE") {
                engineB.stdin.write("uci\n");
            }
            else if (ClientEngine.protocolB == "USI") {
                engineB.stdin.write("usi\n");
            }
            else if (ClientEngine.protocolB == "UCCI") {
                engineB.stdin.write("ucci\n");
            }
        }
    }
    else if (os.type() == 'Darwin' || os.type() == 'Linux') {
        if (ClientEngine.exePathB != "") {
            engineB = spawn('bash', [ClientEngine.exePathB]);
            engineB.on('error', (err) => {
                console.error('[WebSocket Server] Failed to load Black Engine: ', err);
                ws.send("ERROR|LOAD_ENGINE|BLACK");
                return;
            });
            engineB.on('close', (code) => {
                if (wss.clients.has(ws)) {
                    if (ClientEngines.has(ws)) {
                        if (ClientEngines.get(ws).exeStatusB == "TIMEOUT") {
                            console.error("[WebSocket Server] Engine BLACK load timed out.");
                            ws.send("ERROR|ENGINE_TIMEOUT|BLACK");
                            ClientEngines.get(ws).isReloadingBlack = false;
                            ClientEngines.get(ws).black = null;
                            ClientEngines.get(ws).exeStatusB = null;
                            return;
                        }
                        if (!ClientEngines.get(ws).isReloadingBlack) {
                            console.error('[WebSocket Server] Failed to load Black Engine: ', code);
                            ws.send("ERROR|LOAD_ENGINE|BLACK");
                            ClientEngines.get(ws).isReloadingBlack = false;
                            ClientEngines.get(ws).black = null;
                            ClientEngines.get(ws).exeStatusB = null;
                            return;
                        }
                        ClientEngines.get(ws).isReloadingBlack = false;
                        LoadEngineBlack(ws, msg, false);
                    }
                }
            });
            engineB.stdout.on('data', (data) => {
                ws.send("ENGINE_INFO|BLACK|" + data);
            });
            engineB.stderr.on('data', (data) => {
                ws.send("ENGINE_ERROR|BLACK|" + data);
            });
            console.log("[WebSocket Server] Engine ", ClientEngine.exePathB.split('/').at(-1).trim(), " loading for black.");
            console.log("[WebSocket Server] Engine protocol is " + ClientEngine.protocolB);
            if (ClientEngine.protocolB == "UCI" || ClientEngine.protocolB == "UCI_CYCLONE") {
                engineB.stdin.write("uci\n");
            }
            else if (ClientEngine.protocolB == "USI") {
                engineB.stdin.write("usi\n");
            }
            else if (ClientEngine.protocolB == "UCCI") {
                engineB.stdin.write("ucci\n");
            }
        }
    }
    else {
        console.log(`[WebSocket Server] Unknown server OS: ${os.type()}.`);
        return;
    }
    if (engineB == null) {
        return;
    }
    ClientEngines.set(ws, { connection: ws, white: engineW, black: engineB, exeStatusW: exeStatusW, exeStatusB: "LOADING", isReloadingWhite: reloading_engine_white, isReloadingBlack: reloading_engine, exePathW: exePathW, exePathB: ClientEngine.exePathB, protocolW: protocolW, protocolB: ClientEngine.protocolB });
    setTimeout(() => {
        if (ClientEngines.get(ws).exeStatusB == "LOADING") {
            ClientEngines.get(ws).exeStatusB = "TIMEOUT";
            if (os.type() == 'Windows_NT') {
                spawn('taskkill', ['/pid', ClientEngines.get(ws).black.pid, '/f', '/t']);
            }
            else {
                ClientEngines.get(ws).black.kill('SIGKILL');
            }
        }
    }, LoadEngineTimeout);
}