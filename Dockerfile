FROM node:16.17

# Criar os diretórios necessários
RUN mkdir /dag
RUN mkdir /dag/views

# Copiar arquivos do projeto
ADD package.json /dag/
ADD main.js /dag/
ADD /views/dag.ejs /dag/views/

# Instalar dependências
RUN cd /dag && npm install

# Expor as portas usadas pela blockchain
EXPOSE 3001
EXPOSE 6001

# Adicionar um pequeno atraso antes de iniciar a aplicação
ENTRYPOINT sleep 5 && cd /dag && npm install && PEERS=$PEERS npm start
