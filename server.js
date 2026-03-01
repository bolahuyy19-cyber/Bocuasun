const Fastify = require("fastify");
const cors = require("@fastify/cors");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const net = require("net");

Fastify({ logger: false });
const PORT = process.env.PORT || 3001;
const HISTORY_FILE = path.join(__dirname, 'taixiu_history.json');

let rikResults = [];
let rikCurrentSession = null;
let rikWS = null;
let rikIntervalCmd = null;
let rikPingInterval = null;
let rikSimsInterval = null;
let rikHealthCheckInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 1000;
const RECONNECT_INTERVAL = 3000;
let simsCounter = 2;
let lastActivityTime = Date.now();
let connectionStable = false;

// Hàm load lịch sử từ file
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            rikResults = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        }
    } catch (err) {}
}

// Hàm lưu lịch sử vào file
function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(rikResults), 'utf8');
    } catch (err) {}
}

// Hàm xác định kết quả Tài/Xỉu
function getTX(d1, d2, d3) {
    return d1 + d2 + d3 >= 11 ? "T" : "X";
}

// ================== KỸ THUẬT GIỮ KẾT NỐI WEBSOCKET ==================

function checkNetworkConnection() {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);
        
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { resolve(false); });
        socket.connect(80, 'google.com');
    });
}

function sendCustomPing() {
    if (rikWS?.readyState === WebSocket.OPEN) {
        try {
            rikWS.ping('heartbeat_' + Date.now());
            lastActivityTime = Date.now();
        } catch (error) {}
    }
}

function checkConnectionHealth() {
    const now = Date.now();
    const inactiveTime = now - lastActivityTime;
    
    if (inactiveTime > 30000 && rikWS?.readyState === WebSocket.OPEN) {
        sendRikCmd1005();
        sendSimsCommand();
    }
    
    if (now % 60000 < 1000) {
        checkNetworkConnection().then(online => {
            if (!online) {
                if (rikWS) rikWS.close();
            }
        });
    }
}

function getRandomUserAgent() {
    const agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return agents[Math.floor(Math.random() * agents.length)];
}

function sendSimsCommand() {
    if (rikWS?.readyState === WebSocket.OPEN) {
        try {
            rikWS.send(JSON.stringify([7, "Simms", simsCounter, 0]));
            lastActivityTime = Date.now();
            simsCounter++;
            if (simsCounter > 6) simsCounter = 2;
        } catch (error) {}
    }
}

function sendRikCmd1005() {
    if (rikWS?.readyState === WebSocket.OPEN) {
        try {
            rikWS.send(JSON.stringify([6, "MiniGame", "taixiuPlugin", { cmd: 1005 }]));
            lastActivityTime = Date.now();
        } catch (error) {}
    }
}

function sendLobbyCommand() {
    if (rikWS?.readyState === WebSocket.OPEN) {
        try {
            rikWS.send(JSON.stringify([6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]));
            lastActivityTime = Date.now();
        } catch (error) {}
    }
}

function connectRikWebSocket() {
    const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJidWxvbmFwaW5lIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzE5NDM4MDUzLCJhZmZJZCI6IkdFTVdJTiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzYwMzUzMjQxMzI0LCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjE2MC4xOTEuMjQ1LjM3IiwibXV0ZoxNzU5MjMxNjkxODUxLCJwaG9úZI6IiIsImRlcG9zQiOmZhbHNlLCJ1c2VybmFtZSI6Ik.i9QWkeKcMJ0v6NgvG24ADBN4ChvSre7fx6MPtky_Zj4";

    const headers = {
        'Origin': 'https://sun.win',
        'User-Agent': getRandomUserAgent(),
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.from(Math.random().toString(36).substring(2, 18)).toString('base64')
    };

    try {
        const wsOptions = { headers, handshakeTimeout: 10000, maxPayload: 100 * 1024 * 1024, perMessageDeflate: false };
        const endpoints = 
        const selectedEndpoint = endpoints[reconnectAttempts % endpoints.length];
        rikWS = new WebSocket(selectedEndpoint, wsOptions);

        rikWS.on('open', function() {
            reconnectAttempts = 0;
            connectionStable = true;
            lastActivityTime = Date.now();
            const authPayload = [1, "MiniGame", "SC_ghetvc", "123123p", { info: JSON.stringify({ ipAddress: "116.110.42.76", wsToken: TOKEN, locale: "vi", userId: "0dad2f92-68a5-4597-9645-82f4bae8b4bb", username: "SC_hoandz102", timestamp: 1758603427200, refreshToken: "6c2e9bcd0c0d4e1685ec3c32506637d0.da46c71e1b99497c8fdfd7c0ad4d6742", avatar: "https://images.swinshop.net/images/avatar/avatar_02.png", platformId: 2 }), signature: "32163FDB31ED8FFA2ACBF5F6D73B94E3BB7A243A154E8AD8B113811A9649EF8BD197F73C759A8E835A176082B67209C3451BE5EAA6FAA7619BA9E6E36F15A3B452A1AB4C216143BA11052E0638920AEB9103A961CC262EDF8A3B2AC0D89322C2BEACB18B82794905F", pid: 6, subi: true }];
            rikWS.send(JSON.stringify(authPayload));
            clearInterval(rikPingInterval);
            rikPingInterval = setInterval(sendCustomPing, 8000 + Math.random() * 4000);
            clearInterval(rikIntervalCmd);
            rikIntervalCmd = setInterval(() => { sendRikCmd1005(); if (Math.random() > 0.5) sendLobbyCommand(); }, 12000 + Math.random() * 6000);
            clearInterval(rikSimsInterval);
            rikSimsInterval = setInterval(sendSimsCommand, 15000 + Math.random() * 5000);
            clearInterval(rikHealthCheckInterval);
            rikHealthCheckInterval = setInterval(checkConnectionHealth, 5000);
        });

        rikWS.on('message', async (data) => {
            try {
                lastActivityTime = Date.now();
                let json;
                if (typeof data === 'string') { json = JSON.parse(data); } else { const str = data.toString(); json = str.startsWith("[") ? JSON.parse(str) : null; }
                if (!json) return;

          
                            const predictionResult = await predictor.predict();
                            const duDoan = predictionResult.prediction;                           
                            const trangThai = (duDoan === ketQuaThucTe) ? "ĐÚNG" : "SAI";

                            //          rikResults.unshift({
                                sid: res.sid,
                                d1: res.d1,
                                d2: res.d2,
                                d3: res.d3,
                                timestamp: Date.now(),
                                du_doan: duDoan,
                                trang_thai: trangThai
                            });
                            if (rikResults.length > 1000) rikResults.pop();
                            saveHistory();

                            // 4. Cập nhật thuật toán với kết quả của phiên này
                            const score = res.d1 + res.d2 + res.d3;
                            predictor.updateData({ score: score });
                            
                            console.log(`${res.sid} → ${getTX(res.d1, res.d2, res.d3)} (${res.d1},${res.d2},${res.d3}) | Dự đoán: ${duDoan} → ${trangThai}`);
                        }
                    } else if (json[1]?.htr) {
                        rikResults = json[1].htr.map(i => ({ sid: i.sid, d1: i.d1, d2: i.d2, d3: i.d3, timestamp: Date.now() })).sort((a, b) => b.sid - a.sid).slice(0, 1000);
                        saveHistory();
                    }
                }
            } catch (e) {}
        });
        // =================================================================

        rikWS.on('close', (code, reason) => {
            console.log(`KẾT NỐI THÀNH CÔNG ✅✅ (${code})`);
            connectionStable = false;
            clearAllIntervals();
            const baseDelay = Math.min(RECONNECT_INTERVAL * Math.pow(1.2, reconnectAttempts), 10000);
            const delay = baseDelay + Math.random() * 2000;
            reconnectAttempts++;
            if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) { setTimeout(connectRikWebSocket, delay); } else { reconnectAttempts = 0; setTimeout(connectRikWebSocket, 5000); }
        });

        rikWS.on('error', (err) => {});
        rikWS.on('ping', (data) => { lastActivityTime = Date.now(); });
        rikWS.on('pong', (data) => { lastActivityTime = Date.now(); });
        rikWS.on('unexpected-response', (request, response) => {});

    } catch (err) {
        setTimeout(connectRikWebSocket, 3000);
    }
}

function clearAllIntervals() {
    clearInterval(rikHealthCheckInterval);
}

// ================== PHẦN API ==================

fastify.register(cors);

fastify.get("/api/sunwin", async () => {
    const valid = rikResults.filter(r => r.d1 && r.d2 && r.d3);
    if (!valid.length) { return { message: "Không có dữ liệu." }; }
    const current = valid[0];
    const sum = current.d1 + current.d2 + current.d3;
    const predictionResult = await predictor.predict();
    const duDoan = predictionResult.prediction;
    return { "id": "ĐỘC QUYỀN @NguyenTung2029", "Phien": current.sid, "Xuc_xac1": current.d1, "Xuc_xac2": current.d2, "Xuc_xac3": current.d3, "Tổng": sum, "Phien_du_doan": current.sid + 1, "Du_doan": duDoan };
});

fastify.get("/api/history", async () => {
    const valid = rikResults.filter(r => r.d1 && r.d2 && r.d3);
    if (!valid.length) return { message: "địt mẹ m ngu" };
    return valid.slice(0, 50).map(i => ({ session: i.sid, dice: [i.d1, i.d2, i.d3], total: i.d1 + i.d2 + i.d3, result: getTX(i.d1, i.d2, i.d3) === "T" ? "Tài" : "Xỉu" }));
});
    return reply.send(html);
});

const start = async () => {
    try {
        loadHistory();
        setTimeout(connectRikWebSocket, 1000);
        await fastify.listen({ port: PORT, host: "1.1.1.1" });
    } catch (err) { process.exit(1); }
};

process.on('SIGINT', () => { clearAllIntervals(); if (rikWS) rikWS.close(); process.exit(0); });
process.on('uncaughtException', (error) => { setTimeout(connectRikWebSocket, 3000); });
process.on('unhandledRejection', (reason, promise) => {});

start();