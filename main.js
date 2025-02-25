'use strict';
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");
const SHA256 = require('sha256');
const short = require('shortid');
const { setTimeout } = require('timers/promises');

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

var pbftValidatedBlocks = new Set();
var raftValidatedBlocks = new Set();

class Block {
    constructor(id, previousHash, timestamp, nonce, data, hash) {
        this.id = id;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.nonce = nonce;
        this.data = data;
        this.hash = hash.toString();
    }
}

var nodes = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_DAG: 2,
    PBFT: 3,
    RAFT: 4
};

var getGenesisBlock1 = () => {                       // cria o bloco genesis quando a rede é iniciada
    var hora = new Date().toLocaleString('pt-BR');
    return new Block("genesis1", ["0", "0"], hora, "1199", "Bloco gênesis 1", "006534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
};

var getGenesisBlock2 = () => {                       // cria o bloco genesis quando a rede é iniciada
    var hora = new Date().toLocaleString('pt-BR');
    return new Block("genesis2", ["0", "0"], hora, "1120", "Bloco gênesis 2", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
};

function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

var dag = [getGenesisBlock1(), getGenesisBlock2()];                 // define a dag e adiciona o bloco genesis
var reputacao = (Math.floor(Math.random() * 100));                  // define a reputação do nó
var importancia = (Math.floor(Math.random() * 100));                // define a importancia do nó
var numLuck = (Math.floor(Math.random() * 100));                    // define o número da sorte que será sorteado no PoL do nó
var saldo = 100;                                                    // define o saldo do nó
var stake = 0;                                                      // armazena o valor da stake do nó 
var time = 0;
const BONUS = 5;                                                    // define o bonus a ser ganho no PoS
const NODE_ID = short();

console.log("ID => ", NODE_ID);

var initHttpServer = () => {                                        //incia o servidor HTTP
    var app = express();
    app.use(bodyParser.json());
    app.set('view engine', 'ejs');
    //começa a definir as rotas do servidor
    app.get('/blocks', (req, res) => {
        res.render("dag", { result: dag })
    });
    app.post('/mineBlock', (req, res) => {
        switch (req.body.data.algoritmo) {
            case 1:                                 // 1 - PoW
                req.body.data.PoS ? saldo = (saldo - parseFloat(stake)) : saldo;
                req.body.data.PoB ? saldo = (saldo - parseFloat(stake)) : saldo;
                var newBlock = generateNextBlock(req.body.data.dados, req.body.data.dificuldade, 1); // PoW
                addBlock(newBlock);
                broadcast(responseLatestMsg(1)); // 1 = PoW
                console.log('bloco adicionado - POW: OK'); // + JSON.stringify(newBlock));
                req.body.data.PoS ? saldo = (saldo + parseFloat(stake) + BONUS) : saldo;
                res.send("POW");
                break;
            case 2:                                 // 2 - PoS
                saldo = (saldo - parseFloat(stake));
                var newBlock = generateNextBlock(req.body.data.dados, 0, 2); // 2 PoS
                addBlock(newBlock);
                broadcast(responseLatestMsg(2));
                console.log('bloco adicionado - PoS: OK');
                saldo = (saldo + parseFloat(stake) + BONUS);
                res.send("PoS");
                break;
            case 3:                                 // 3 =  PBFT
                req.body.data.PoS ? saldo = (saldo - parseFloat(stake)) : saldo;
                req.body.data.PoB ? saldo = (saldo - parseFloat(stake)) : saldo;
                var newBlock = generateNextBlock(req.body.data.dados, 0, 3); // 0 = difc, 3 = PBFT
                broadcast(pre_preparation(newBlock, [NODE_ID], req.body.data.nodes));
                console.log('bloco adicionado - PBFT: OK');
                req.body.data.PoS ? saldo = (saldo + parseFloat(stake) + BONUS) : saldo;
                res.send("PBFT");
                break;
            case 4:                             // 4 = RAFT
                req.body.data.PoS ? saldo = (saldo - parseFloat(stake)) : saldo;
                req.body.data.PoB ? saldo = (saldo - parseFloat(stake)) : saldo;
                var newBlock = generateNextBlock(req.body.data.dados, 0, 4); // 0 = difc, 4 = RAFT
                broadcast(suggestion(newBlock, [NODE_ID], req.body.data.lider, req.body.data.nodes));
                console.log('bloco adicionado - RAFT: OK');
                req.body.data.PoS ? saldo = (saldo + parseFloat(stake) + BONUS) : saldo;
                res.send("RAFT");
                break;
            case 5:                             // 5 = PoET
                req.body.data.PoS ? saldo = (saldo - parseFloat(stake)) : saldo;
                req.body.data.PoB ? saldo = (saldo - parseFloat(stake)) : saldo;
                var newBlock;
                async function Time() {
                    await setTimeout(req.body.data.time[1]);
                    newBlock = generateNextBlock(req.body.data.dados, 0, 5); // 5 = PoET
                    addBlock(newBlock);
                    broadcast(responseLatestMsg());
                    console.log('bloco adicionado - PoET: OK');
                    console.log("Time: ", req.body.data.time[1]);
                    res.send("PoET");
                }
                Time();
                break;
            case 6:                             // 6 = PoA
                req.body.data.PoS ? saldo = (saldo - parseFloat(stake)) : saldo;
                req.body.data.PoB ? saldo = (saldo - parseFloat(stake)) : saldo;
                var newBlock = generateNextBlock(req.body.data.dados, 0, 6); //6 PoA
                addBlock(newBlock);
                broadcast(responseLatestMsg());
                console.log('bloco adicionado - PoA: OK');
                req.body.data.PoS ? saldo = (saldo + parseFloat(stake) + BONUS) : saldo;
                res.send("PoA");
                break;
            case 7:                             // 7 = PoI
                req.body.data.PoS ? saldo = (saldo - parseFloat(stake)) : saldo;
                req.body.data.PoB ? saldo = (saldo - parseFloat(stake)) : saldo;
                var newBlock = generateNextBlock(req.body.data.dados, 0, 7); // 7 PoI
                addBlock(newBlock);
                broadcast(responseLatestMsg());
                console.log('bloco adicionado - PoI: OK');
                req.body.data.PoS ? saldo = (saldo + parseFloat(stake) + BONUS) : saldo;
                res.send("PoI");
                break;
            case 8:                             // 8 = PoL
                req.body.data.PoS ? saldo = (saldo - parseFloat(stake)) : saldo;
                req.body.data.PoB ? saldo = (saldo - parseFloat(stake)) : saldo;
                var newBlock = generateNextBlock(req.body.data.dados, 0, 8); // 8 PoL
                addBlock(newBlock);
                broadcast(responseLatestMsg());
                console.log('bloco adicionado - PoL: OK');
                req.body.data.PoS ? saldo = (saldo + parseFloat(stake) + BONUS) : saldo;
                res.send("PoL");
                break;
            case 9:                             // 9 = dPoS
                req.body.data.PoS ? saldo = (saldo - parseFloat(stake)) : saldo;
                req.body.data.PoB ? saldo = (saldo - parseFloat(stake)) : saldo;
                var newBlock = generateNextBlock(req.body.data.dados, 0, 9); // 9 dPoS
                addBlock(newBlock);
                broadcast(responseLatestMsg());
                req.body.data.PoS ? saldo = (saldo + parseFloat(stake) + BONUS) : saldo;
                console.log('bloco adicionado - dPoS: OK', saldo);
                res.send("dPoS");
                break;
            case 10:                             // 10 = PoB
                req.body.data.PoS ? saldo = (saldo - parseFloat(stake)) : saldo;
                req.body.data.PoB ? saldo = (saldo - parseFloat(stake)) : saldo;
                var newBlock = generateNextBlock(req.body.data.dados, 0, 10); // 10 PoB
                addBlock(newBlock);
                broadcast(responseLatestMsg());
                req.body.data.PoS ? saldo = (saldo + parseFloat(stake) + BONUS) : saldo;
                console.log('bloco adicionado - PoB: OK', saldo);
                res.send("PoB");
                break;
            default:
                console.log(`Sorry, você não escolheu um algortimo de consenso!`);
        }
    });
    app.get('/peers', (req, res) => {
        res.send(nodes.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send("addPeer!!");
    });
    app.get('/getReputation', (req, res) => {           // retorna a reputação do nó
        res.send({ rep: reputacao });
    });
    app.get('/getImportance', (req, res) => {           // retorna a importancia do nó
        res.send({ imp: importancia });
    });
    app.get('/getNumLuck', (req, res) => {           // retorna o numero da sorte do nó
        res.send({ luck: numLuck });
    });
    app.get('/getStake', (req, res) => {                // retorna a stake que o nó oferece ao PoS
        stake = (Math.random() * 10).toFixed(2);
        res.send({ saldo: saldo, stake: stake });
    });
    app.get('/getBalance', (req, res) => {
        res.send({saldo : saldo});
    });
    app.get('/getTime', (req, res) => {                 // retorna o time de sleep em ms do PoET
        time = parseInt(getRandomArbitrary(1, 10000));
        res.send({ time: time });
    });
    app.listen(http_port, () => console.log('Ouvindo http na porta: ' + http_port));
};

var initP2PServer = () => {
    var server = new WebSocket.Server({ port: p2p_port });          // define o socket na porta 6001
    server.on('connection', ws => initConnection(ws));              // inicia o socket
    console.log('Ouvindo o websocket p2p na porta: ' + p2p_port);   // 6001
};

var initConnection = (ws) => {                                      // inicia a conexão socket
    nodes.push(ws);                                                 // ws = web socket - adiciona aos nós
    initMessageHandler(ws);                                         // incia o manipulador de mensagens
    initErrorHandler(ws);                                           // incia o manipulador de mensagens
    write(ws, queryAllMsg());                                       // Sincronização inicial: solicitar toda a blockchain ao conectar a um peer.
};


var initMessageHandler = (ws) => {                          // responsavel por receber e manipular as mensagens do socket
    ws.on('message', (data) => {                            // fica ouvindo novas menssagens!!
        var message = JSON.parse(data);                     //console.log('Nova mensagem recebida ====== ' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:                  // = 0 CONSULTA MAIS RECENTE
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:                     // = 1 CONSULTAR TODOS
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_DAG:                  // = 2 RESPOSTA A dag
                handleDagResponse(message);
                break;
            case MessageType.PBFT:
                const blockHash = message.data.hash;
                var f = Math.floor(message.nodes / 3);
            
                // Primeiro, verifica se o bloco é válido
                if (!isValidNewBlock(message.data)) {
                    break;
                }
                // Se o bloco já foi validado, ignore a mensagem
                if (pbftValidatedBlocks.has(blockHash)) {
                    break;
                }
                // Se o número de assinaturas for suficiente, finalize o consenso
                if (message.signatures.length >= 6) {
                    addBlock(message.data);
                    pbftValidatedBlocks.add(blockHash);
                    broadcast(responseLatestMsg());
                    break;
                }
                // Se este nó ainda não assinou, adicione sua assinatura
                if (message.signatures.indexOf(NODE_ID) === -1) {
                    message.signatures.push(NODE_ID);
                    broadcast(pre_preparation(message.data, message.signatures, message.nodes));
                }
                break;
            case MessageType.RAFT:
                const blockHashRaft = message.data.hash;
            
                // Se o bloco já foi finalizado, ignore.
                if (raftValidatedBlocks.has(blockHashRaft)) {
                    break;
                }
                // Verifica se o bloco é válido
                if (!isValidNewBlock(message.data)) {
                    break;
                }
            
                //var totalNodes = message.nodes; // ou use uma variável global que contenha a contagem atual de nós
                // Se o número de assinaturas coletadas for suficiente, finalize o consenso.
                if (message.signatures.length >= 6) {
                    addBlock(message.data);
                    raftValidatedBlocks.add(blockHashRaft);
                    broadcast(responseLatestMsg());
                    break;
                }
                // Se este nó ainda não assinou, adicione sua assinatura e retransmita.
                if (!message.signatures.includes(NODE_ID)) {
                    message.signatures.push(NODE_ID);
                    broadcast(suggestion(message.data, message.signatures, message.lider, message.nodes));
                }
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('Conexão falhou - peer: ' + ws.url);
        nodes.splice(nodes.indexOf(ws), 1);
        if (ws.url) {
            setTimeout(() => connectToPeers([ws.url]), 5000); // Reconectar após 5 segundos
        }
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};


var generateNextBlock = (dados, dificuldade, algoritmo) => {
    switch (algoritmo) {
        case 1: //POW
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = PoW(dados, dificuldade);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;
            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        case 2: //POS
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = PoS(dados);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;
            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        case 3: //PBFT
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = PBFT(dados);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;

            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        case 4: //RAFT
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = RAFT(dados);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;

            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        case 5: // PoET
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = PoET(dados);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;

            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        case 6: // PoA
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = PoA(dados);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;

            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        case 7: // PoI
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = PoI(dados);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;

            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        case 8: // PoL
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = PoL(dados);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;

            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        case 9: // dPoS
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = dPoS(dados);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;

            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        case 10: // PoB
            var previousBlock = getAnterioresAleatorios();
            var previousBlockHash = [previousBlock[0].hash, previousBlock[1].hash];
            var nextId = short();

            var valorBloco = PoB(dados);

            var nonce = valorBloco.nonce;
            var blockHash = valorBloco.hash;
            var nextTimestamp = valorBloco.timestamp;

            return new Block(nextId, previousBlockHash, nextTimestamp, nonce, dados, blockHash);
        default:
            break;
    }
};

function RAFT(dados) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var nonce = "Not used in RAFT";
    var hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    return { hash, nonce, timestamp };
}

function PBFT(dados) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var nonce = "Not used in PBFT";
    var hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    return { hash, nonce, timestamp };
}

function PoET(dados) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var nonce = "Not used in PoET";
    var hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    return { hash, nonce, timestamp };
}

function PoS(dados) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var nonce = "Not used in PoS";
    var hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    return { hash, nonce, timestamp };
}

function PoB(dados) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var nonce = "Not used in PoB";
    var hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    return { hash, nonce, timestamp };
}

function dPoS(dados) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var nonce = "Not used in dPoS";
    var hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    return { hash, nonce, timestamp };
}

function PoA(dados) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var nonce = "Not used in PoA";
    var hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    return { hash, nonce, timestamp };
}

function PoI(dados) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var nonce = "Not used in PoI";
    var hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    return { hash, nonce, timestamp };
}

function PoL(dados) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var nonce = "Not used in PoL";
    var hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    return { hash, nonce, timestamp };
}

function PoW(dados, dificuldade) {
    var hash = SHA256(JSON.stringify(dados));

    var nonce = 0;
    var timestamp = new Date().toLocaleString('pt-BR');
    while (hash.substring(0, dificuldade) !== Array(dificuldade + 1).join("0")) {
        nonce++;
        hash = SHA256(timestamp + JSON.stringify(dados) + nonce).toString();
    }
    return { hash, nonce, timestamp };
}

function blockExists(newBlock) {
    return dag.some(function(b) {
        return b.hash === newBlock.hash;
    });
}

var addBlock = (newBlock) => {                                  
    if (!blockExists(newBlock) && isValidNewBlock(newBlock)) {
        dag.push(newBlock);
    } else {
        console.log(`Bloco ${newBlock.hash} já existe ou é inválido.`);
    }
};


var isValidNewBlock = (newBlock) => {                             // verifica se o bloco é válido
    var hash = SHA256(newBlock.timestamp + JSON.stringify(newBlock.data) + newBlock.nonce).toString();
    if (newBlock.hash !== hash) {
        console.log('bloco inválido');
        return false;
    }
    return true;
};

var connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        if (!peer.startsWith('ws://')) { // Verifica se a URL é válida
            console.log(`Peer inválido: ${peer}`);
            return;
        }

        if (nodes.find(node => node._socket && node._socket.url === peer)) {
            console.log(`Já conectado a ${peer}, ignorando reconexão.`);
            return;
        }

        var ws = new WebSocket(peer);
        ws.on('open', () => {
            console.log(`Conectado ao peer: ${peer}`);
            initConnection(ws);
        });
        ws.on('close', () => {
            console.warn(`Conexão fechada com o peer: ${peer}`);
            setTimeout(() => connectToPeers([peer]), 10000); // Aumentei o tempo para 10s
        });
        ws.on('error', (err) => {
            console.error(`Erro ao conectar ao peer ${peer}: ${err.message}`);
            setTimeout(() => connectToPeers([peer]), 10000); // Evita tentar reconectar rapidamente
        });
    });
};

var handleDagResponse = (message) => {
    var receivedBlocks = JSON.parse(message.data);
    var newBlock = receivedBlocks[0]; // O novo bloco recebido

    // Se o bloco já existe, ignore.
    if (blockExists(newBlock)) {
        console.log(`Bloco ${newBlock.hash} já existe na cadeia. Ignorando.`);
        return;
    }

    if (message.size == 2) {
        // Se a mensagem contém somente o bloco gênesis, talvez queira substituir a cadeia
        if (newBlock.timestamp > dag[0].timestamp) {
            console.log("O NOVO BLOCO É MAIS ANTIGO que o bloco gênesis atual");
            replaceChain(receivedBlocks);
        }
    } else if (message.algoritmo == 1) {     // Para algoritmos confiáveis (POA e POW, por exemplo)
        if (message.size > dag.length) {
            console.log('NODE Confiável. Adicionando o bloco ao nosso DAG...');
            addBlock(newBlock);
            broadcast(responseLatestMsg(message.algoritmo));
        }
    } else if (message.size > dag.length) {
        console.log('DAG possivelmente atrasada. Valor obtido: ' + message.size + ' e este nó tem: ' + dag.length);
        // Verifica se o hash do último bloco na cadeia é compatível com o novo bloco recebido
        if ((receivedBlocks[0].previousHash[0] === receivedBlocks[1].hash) ||
            (receivedBlocks[0].previousHash[0] === receivedBlocks[2].hash)) {
            console.log("Podemos adicionar o bloco recebido à nossa DAG!");
            addBlock(newBlock);
            broadcast(responseLatestMsg());
        }
    } else {
        console.log('O DAG recebido não é maior que o DAG atual. Não fazer nada.');
    }
};

var replaceChain = (newBlocks) => {
    console.log('Tentando substituir a blockchain pelo novo DAG recebido...');
    if (isValidChain(newBlocks) && newBlocks.length > dag.length) {
        console.log('Novo DAG é válido. Substituindo o DAG atual.');
        dag = newBlocks;
        broadcast(responseLatestMsg());
    } else {
        console.log('Novo DAG é inválido ou não é maior que o atual. Rejeitado.');
    }
};

// Função para validar se uma blockchain é válida.
var isValidChain = (chain) => {
    if (JSON.stringify(chain[0]) !== JSON.stringify(dag[0])) {
        console.log('Bloco gênesis é diferente. Blockchain inválida!');
        return false;
    }
    for (let i = 1; i < chain.length; i++) {
        if (!isValidNewBlock(chain[i], chain[i - 1])) {
            return false;
        }
    }
    return true;
};

const discoverPeers = () => {
    const swarmServiceName = 'node'; // Nome do serviço Docker Swarm
    const swarmPort = 6001; // Porta P2P
    //const totalReplicas = 500; // Quantidade de réplicas

    for (let i = 1; i <= 10; i++) {
        const peerUrl = `ws://${swarmServiceName}:${swarmPort}`;
        console.log(`Tentando conectar ao peer: ${peerUrl}`); // DEBUG: Imprimir URL

        if (!nodes.find(node => node._socket && node._socket.url === peerUrl)) {
            try {
                connectToPeers([peerUrl]);
            } catch (error) {
                console.error(`Erro ao conectar ao peer ${peerUrl}:`, error.message);
            }
        }
    }
};


function getBlockArbitrary(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
}

var getAnterioresAleatorios = () => {
    if (dag.length == 2) {
        return [dag[0], dag[1]];
    } else {
        var x = getBlockArbitrary(0, dag.length);
        var y = getBlockArbitrary(0, dag.length);
        if (y == x) {
            while (y == x) {
                y = getBlockArbitrary(0, dag.length);
            }
        }
        return [dag[x], dag[y]];
    }
};

var getUltimoEvizinhos = () => {
    var ultimo = dag[dag.length - 1];
    const vizinho1 = ultimo.previousHash[0];
    const vizinho2 = ultimo.previousHash[1];
    var result = [ultimo];
    if (ultimo.id == "genesis2") {
        return dag;
    } else {
        for (let i = 0; i < dag.length; i++) {
            if (dag[i].hash == vizinho1 || dag[i].hash == vizinho2) {
                result.push(dag[i]);
            }
        }
        return result;
    }

}


var queryAllMsg = () => ({ 'type': MessageType.QUERY_ALL });

var responseChainMsg = () => ({
    'type': MessageType.RESPONSE_DAG,
    'data': JSON.stringify(dag)
});
var responseLatestMsg = (algoritmo) => ({
    'type': MessageType.RESPONSE_DAG,
    'size': dag.length,
    'algoritmo': algoritmo,
    'data': JSON.stringify(getUltimoEvizinhos())
});

var pre_preparation = (newBlock, node_id, nodes) => ({
    'type': MessageType.PBFT,
    'data': newBlock,
    'nodes': nodes,
    'signatures': node_id.slice()
})

var suggestion = (newBlock, node_id, lider, nodes) => ({
    'type': MessageType.RAFT,
    'data': newBlock,
    'nodes': nodes,
    'lider': lider,
    'signatures': node_id.slice()
})

var write = (ws, message) => ws.send(JSON.stringify(message));

var broadcast = (message) => {
    nodes.forEach((socket, index) => {
        if (socket.readyState === WebSocket.OPEN) {
            write(socket, message);
        } else {
            console.log(`Removendo socket inativo: ${socket.url}`);
            nodes.splice(index, 1); // Remove sockets fechados
        }
    });
};

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();
discoverPeers();