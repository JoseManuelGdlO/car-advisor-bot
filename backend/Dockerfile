FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Copia aparte de las imágenes versionadas. El volumen de runtime no la tapa.
RUN mkdir -p /app/autobot-seed \
  && if [ -d /app/autobot ]; then cp -a /app/autobot/. /app/autobot-seed/; fi

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["npm", "start"]
