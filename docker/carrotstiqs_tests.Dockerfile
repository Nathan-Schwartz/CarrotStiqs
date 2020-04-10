FROM node:10

ARG NPM_TOKEN
ARG FOLDER_NAME
ENV NPM_TOKEN=$NPM_TOKEN

# Setup main folder
WORKDIR /var/CarrotStiqs
ADD package.json package.json
ADD yarn.lock yarn.lock
RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > .npmrc && yarn install --production=false

ADD . .

CMD ["bash", "docker/docker-start.sh"]
