import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authMiddleware from './middlewares/auth';
import { passportMiddleware } from './middlewares/auth';
import { createOnConnect, buildContext } from 'graphql-passport';
import { User } from './models';
import graphqlMiddleware from './middlewares/graphql';
import errors from './const/errors';
import { ApolloServer } from 'apollo-server-express';
import schema from './schema';
import { createServer } from 'http';
import * as dotenv from 'dotenv';
dotenv.config();

if (process.env.DB_PREFIX === 'mongodb+srv') {
    mongoose.connect(
        `${process.env.DB_PREFIX}://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`, {
            useCreateIndex: true,
            useNewUrlParser: true,
            autoIndex: true
        });
} else {
    mongoose.connect(`${process.env.DB_PREFIX}://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@${process.env.APP_NAME}@`);
}

mongoose.connection.once('open', () => {
    console.log('connected to database');
});

/*  For CORS, ALLOWED-ORIGINS param of .env file should have a format like that:
    ALlOWED_ORIGINS="<origin-1>, <origin-2>"
    Ex:
    ALLOWED_ORIGINS="http://localhost:4200, http://localhost:3000"
*/
// eslint-disable-next-line no-undef
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(', ');

const PORT = 3000;
const app = express();

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = errors.invalidCORS;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

app.use(authMiddleware);
app.use('/graphql', graphqlMiddleware);

const apolloServer = new ApolloServer({
    schema,
    subscriptions: {
        onConnect: createOnConnect([
            passportMiddleware,
        ])
    },
    context: ({ req, res }) => buildContext({ req, res, User }), // Probably need to change User or an intermediate type implementing functions getUSers and addUser
});

apolloServer.applyMiddleware({
    app
});

const httpServer = createServer(app);
apolloServer.installSubscriptionHandlers(httpServer);

httpServer.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}${apolloServer.graphqlPath}`);
    console.log(`🚀 Server ready at ws://localhost:${PORT}${apolloServer.subscriptionsPath}`);
});