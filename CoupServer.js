// CoupServer.js
// This contains the server-side javascript object for CoupServer.

var CoupModel = require('./CoupModel');
var CoupController = require('./CoupController');

// This is the top-level JavaScript object for the game
function CoupServer(port)
{
    this.model = new CoupModel(this);
    this.controller = new CoupController(this);
    this.controller.start(port, this.model);
}

module.exports =  new CoupServer(6080);
