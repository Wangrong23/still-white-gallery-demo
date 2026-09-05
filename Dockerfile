FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.html ./
COPY client ./client
COPY shared ./shared
COPY server ./server
ENV NODE_ENV=production
ENV PORT=5000
ENV HOST="::"
EXPOSE 5000
USER node
CMD ["node", "server/index.js"]
