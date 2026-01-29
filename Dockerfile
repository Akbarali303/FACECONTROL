FROM node:18-alpine

# Dahua event stream uses curl; backup uses pg_dump
RUN apk add --no-cache curl postgresql-client

WORKDIR /app

# package files
COPY package*.json ./

# install only production deps
RUN npm install --omit=dev

# copy project
COPY . .

# backend port
EXPOSE 3001

# start backend
CMD ["node", "start-backend-simple.js"]
