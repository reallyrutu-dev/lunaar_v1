FROM node:20-slim

ARG EXPO_SDK=57

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

RUN npx --yes create-expo-app@latest /opt/expo-template --template blank-typescript@sdk-${EXPO_SDK} --no-install

WORKDIR /opt/expo-template

RUN npm install --no-audit --no-fund --legacy-peer-deps

RUN npx expo install react-native-web react-dom @expo/metro-runtime expo-status-bar expo-font expo-haptics expo-image expo-linear-gradient expo-sensors expo-location expo-camera expo-image-picker expo-notifications react-native-screens react-native-safe-area-context @react-native-async-storage/async-storage @expo/vector-icons -- --no-audit --no-fund --legacy-peer-deps

RUN npm install --no-audit --no-fund --legacy-peer-deps @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs @supabase/supabase-js date-fns zod nanoid @expo-google-fonts/inter @expo-google-fonts/dm-sans @expo-google-fonts/manrope @expo-google-fonts/plus-jakarta-sans @expo-google-fonts/space-grotesk @expo-google-fonts/sora @expo-google-fonts/outfit @expo-google-fonts/nunito @expo-google-fonts/lora

RUN echo '{"extends":"expo/tsconfig.base","compilerOptions":{"strict":false,"noImplicitAny":false,"noEmit":true,"skipLibCheck":true,"allowJs":true,"checkJs":false,"jsx":"react-native","resolveJsonModule":true,"esModuleInterop":true},"include":["**/*.ts","**/*.tsx"],"exclude":["node_modules","dist","backend","ios","android",".expo"]}' > /opt/expo-template/tsconfig.json

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

ENV TEMPLATE_DIR=/opt/expo-template
ENV PORT=4000

EXPOSE 4000

CMD ["node", "server.js"]