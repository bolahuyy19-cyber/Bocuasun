const Fastify = require("fastify");
const cors = require("@fastify/cors");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const net = require("net");


const fastify = Fastify({ logger: false }); 
const PORT = process.env.PORT || 3001;
const HISTORY_FILE = path.join(__dirname, 'taixiu_history.json');

let rikResults = [];
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


const predictor = {
    predict: async () => ({ prediction: Math.random() > 0.5 ? "Tài" : "Xỉu" }),
    updateData: (data) => {}
};

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            rikResults = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        }
    } catch (err) {}
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(rikResults), 'utf8');
    } catch (err) {}
}

function getTX(d1, d2, d3) {
    return d1 + d2 + d3 >= 11 ? "T" : "X";
}

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
}

function getRandomUserAgent() {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
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
        'Upgrade': 'websocket'
    };

    try {

        const endpoints = ["wss://luck.sunwin.fun/websocket"]; 
        const selectedEndpoint = endpoints[reconnectAttempts % endpoints.length];
        rikWS = new WebSocket(selectedEndpoint, { headers });

        rikWS.on('open', function() {
            reconnectAttempts = 0;
            lastActivityTime = Date.now();
            const authPayload = [1, "MiniGame", "SC_ghetvc", "123123p", { info: JSON.stringify({ wsToken: TOKEN, platformId: 2 }), pid: 6, subi: true }];
            rikWS.send(JSON.stringify(authPayload));
            
            clearInterval(rikPingInterval);
            rikPingInterval = setInterval(sendCustomPing, 10000);
            
            clearInterval(rikIntervalCmd);
            rikIntervalCmd = setInterval(() => { sendRikCmd1005(); }, 15000);
        });

        rikWS.on('message', async (data) => {
            try {
                lastActivityTime = Date.now();
                let json = JSON.parse(data.toString());
                if (json[0] === 6 && json[2] === "taixiuPlugin") {
                    const res = json[3];
                    if (res.cmd === 1005 && res.d1) {
                        const ketQuaThucTe = getTX(res.d1, res.d2, res.d3) === "T" ? "Tài" : "Xỉu";
                        const predictionResult = await predictor.predict();
                        const duDoan = predictionResult.prediction;
                        const trangThai = (duDoan === ketQuaThucTe) ? "ĐÚNG" : "SAI";

                        rikResults.unshift({
                            sid: res.sid, d1: res.d1, d2: res.d2, d3: res.d3,
                            timestamp: Date.now(), du_doan: duDoan, trang_thai: trangThai
                        });
                        if (rikResults.length > 1000) rikResults.pop();
                        saveHistory();
                        console.log(`${res.sid} → ${ketQuaThucTe} | Dự đoán: ${duDoan} → ${trangThai}`);
                    }
                }
            } catch (e) {}
        });

        rikWS.on('close', () => {
            console.log(`KẾT NỐI ĐÃ ĐÓNG - ĐANG THỬ LẠI`);
            setTimeout(connectRikWebSocket, RECONNECT_INTERVAL);
        });

        rikWS.on('error', (err) => {});
    } catch (err) {
        setTimeout(connectRikWebSocket, 3000);
    }
}



fastify.register(cors);

fastify.get("/api/sunwin", async () => {
    const valid = rikResults.filter(r => r.d1 && r.d2 && r.d3);
    if (!valid.length) return { message: "Không có dữ liệu." };
    const current = valid[0];
    const sum = current.d1 + current.d2 + current.d3;
    const predictionResult = await predictor.predict();
    return { 
        "id": "ĐỘC QUYỀN @NguyenTung2029", 
        "Phien": current.sid, 
        "Xuc_xac": [current.d1, current.d2, current.d3], 
        "Tổng": sum, 
        "Du_doan_phien_sau": predictionResult.prediction 
    };
});

fastify.get("/api/history", async () => {
    return rikResults.slice(0, 50);
});


fastify.get("/", async () => {
    return { status: "running" };
});

const start = async () => {
    try {
        loadHistory();
        connectRikWebSocket();

        await fastify.listen({ port: PORT, host: "0.0.0.0" });
        console.log("Server is running on port " + PORT);
    } catch (err) { process.exit(1); }
};

start();
