// Require the framework and instantiate it
import fastify from "fastify";
import cookie from "cookie";
import * as admin from "firebase-admin";
import fastifyCors from 'fastify-cors';
import fs from 'fs';
import path from 'path';

const config = { 
  logger: true,
  http2: true,
  https: {
    allowHTTP1: true, // fallback support for HTTP1
    key: fs.readFileSync(path.join('/etc/nginx/certs', 'default.key')),
    cert: fs.readFileSync(path.join('/etc/nginx/certs', 'default.crt'))
  }
};
const server = fastify(config);
server.log.info('config', config);
server.register(fastifyCors);

let app = admin.initializeApp();
const auth = app.auth();

// Declare a route
const host = process.env['VIRTUAL_HOST'];
server.get("/", async (request, reply) => {
  // TODO: OpenAPI JSON spec
  return { status: 'ok', endpoints: [
    {
      url: `https://${host}/`
    },
    {
      url: `https://${host}/docker`
    },
    {
      url: `https://${host}/auth`
    },
    {
      url: `https://${host}/logout`,
      method: 'post'
    },
    {
      url: `https://${host}/session`,
      method: 'post'
    },
  ] };
});
server.get("/auth", async (request, reply) => {
  // validate request headers
  // bearer token in authorization or session cookie
  const cookies = cookie.parse(request.headers.cookie || "");
  const authHeader = request.headers.authorization || "";
  let idToken, user;
  if (authHeader.toLowerCase().includes("bearer")) {
    idToken = authHeader.split(" ")[1];
  }
  let authorized = false;
  try {
    const session = cookies.session;
    if (session) {
      user = await auth.verifySessionCookie(session);
      authorized = user !== undefined;
    } else if (idToken) {
      user = await auth.verifyIdToken(idToken);
      authorized = user !== undefined;
    }
  } catch (e) {
    server.log.error(e);
    return reply.code(401).send(e);
  }

  if (authorized) {
    reply.code(200).send({
      user,
      cookies,
      headers: request.headers,
    });
  } else {
    reply.code(401).send({
      user,
      cookies,
      headers: request.headers,
    });
  }
});

const maxCookieExpiry = 2 * 604800000;
server.post("/session", async (request, reply) => {
  let idToken, user, customToken, session;
  const authHeader = request.headers.authorization || "";
  if (authHeader.toLowerCase().includes("bearer")) {
    idToken = authHeader.split(" ")[1];
  }
  if (!idToken)
    return reply
      .code(400)
      .send({
        code: 400,
        message: "Bad Request: missing Authorization header",
      });
  try {
    user = await auth.verifyIdToken(idToken);
    session = await auth.createSessionCookie(idToken, {
      expiresIn: maxCookieExpiry,
    });
  } catch (e) {
    return reply.code(401).send(e);
  }

  reply
    .code(200)
    .send({ user, customToken, idToken, session });
});

// Run the server!
const start = async () => {
  const port = parseInt(process.env.NODE_PORT || "5000");
  server.listen(port, "0.0.0.0", function (err, address) {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
    server.log.info(process.env);
  });
};
start();

import './routes/docker';

export {server};