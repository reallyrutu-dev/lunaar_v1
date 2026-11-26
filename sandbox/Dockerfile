
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

RUN npx --yes create-expo-app@latest /opt/expo-template --template default --no-install

WORKDIR /opt/expo-template

RUN rm -rf app components constants hooks scripts

RUN npm install

RUN npx expo install react-native-web react-dom @expo/metro-runtime expo-linear-gradient expo-haptics expo-image @expo/vector-icons

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV TEMPLATE_DIR=/opt/expo-template
ENV PORT=4000

EXPOSE 4000

CMD ["node", "server.js"]