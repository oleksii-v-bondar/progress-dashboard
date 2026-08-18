FROM node:20-alpine

WORKDIR /app

COPY backend/package.json ./
RUN npm install

COPY backend/tsconfig.json ./
COPY backend/src/ ./src/
COPY shared/ ./shared/

EXPOSE 4000

CMD ["npm", "run", "dev"]
