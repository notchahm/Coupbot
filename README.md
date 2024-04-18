# Coupbot

Description: A project to simulate & automate playing of the Coup card game. The goal is to create a platform on which individuals can run agents that run a policy that implements a strategy to win games played against competing agents. Currently the project only has an API that attempts to follow the established rules of the game and updates the game state in response to legal moves.

Getting started:
Requires nodejs and npm.
1. run `npm install`
2. run `npm run dev` to run in development mode or `npm start` to run in production
3. Use nginx to reverse proxy to the nodejs process listening on the local port
4. Call the REST API using HTTP GET/POST commands, parse the json output
