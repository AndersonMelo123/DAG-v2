const { initializeApp } = require("firebase/app");
const { getDatabase, ref, child, get, onValue } = require("firebase/database");
const axios = require('axios');
const grava = require('node:fs/promises');


async function PoA_POW(numNodes, dificuldade) {


    payload = "Dados que eu criei e enviei para o bloco";

    var timeStart = performance.now();

    var node = await Reputacao(numNodes);
    console.log(node);

    await axios.post(`http://localhost:300${node}/mineBlock`, {
        data: { "dados": payload, "dificuldade": dificuldade, "algoritmo": 1 } // 1 = PoA-PoW, 2 = PoA-PoS, 3 = PoS-PoW, 4 =PBFT
    }).then((res) => {
        var timeEnd = performance.now();
        var tempo = timeEnd - timeStart;
        grava.appendFile('tempo_PoA_PoW_1no.txt', `${tempo},\n`, (err) => { if (err) throw err });
        console.log(res.data, "=> Tempo: ", tempo);
    }).catch((error) => {
        console.error("Erro:", error);
    });

}

async function Reputacao(quant_nodes) {
    var reputacao = [];

    for (let i = 1; i <= quant_nodes; i++) {
        await axios.get(`http://localhost:300${i}/reputacao`).then(resp => {
            console.log("Reputação de ", i, ":", resp.data.rep);
            reputacao.push(resp.data.rep);
        });
    }

    const maior = Math.max.apply(null, reputacao);
    for (let i = 0; i < reputacao.length; i++) {
        if (reputacao[i] == maior) {
            return i + 1;
        };
    }
}

PoA_POW(1, 3); //(nos, dificuldade)