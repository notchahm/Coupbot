// CoupController.js
// This contains the server-side controller for the Coup API.
// The CoupController uses the express module to route calls to the API

const express = require('express');
const fs = require('fs');
const https = require('https');
const http = require('http');

// This is the JavaScript controller object for the game
function CoupController()
{
    let m_port = null;
	let m_model = null;
	const action_params = {
		"tax":{ "name":"tax", "cost":0, "proved_by":["Duke"], "blocked_by":[], "callback": (session, player, action) => {return session.take_coins(player, 3)} },
		"foreign_aid": { "name":"foreign_aid", "cost":0, "proved_by":null, "blocked_by":["Duke"], "callback": (session, player, action) => {return session.take_coins(player, 2)} },
		"income": { "name":"income", "cost":0, "proved_by":null, "blocked_by":[], "callback": (session, player, action) => {return session.take_coins(player, 1)} },
		"coup": { "name":"coup", "cost":7, "proved_by":null, "blocked_by":[], "callback": (session, player, action) => {return session.prompt_lose_influence(player, action)} },
		"assassinate": { "name":"assassinate", "cost":3, "proved_by":["Assassin"], "blocked_by":["Contessa"], "callback": (session, player, action) => {return session.prompt_lose_influence(player, action) } },
		"steal": { "name":"steal", "cost":0, "proved_by":["Captain"], "blocked_by":["Captain", "Ambassador"], "callback": (session, player, action) => {return session.steal_coins(player, 2, action)} },
		"exchange": { "name":"exchange", "cost":0, "proved_by":["Ambassador"], "blocked_by":[], "callback": (session, player, action) => {return session.exchange_cards(player, action)} }
	};

	let handle_setup = function(request, response)
	{
		if (m_model)
		{
			m_model.setup_session(function(game_state)
			{
				response.type('text/plain');
				response.send(game_state.entry);
			});
		}
	}

	let handle_end_game = function(request, response)
	{
		if (request.query)
		{
			let paths = request.url.split("/");
			let method = paths.pop()
			let session_id = paths.pop();
			console.log("ending", session_id);
			m_model.end_session(session_id).then((game_state) =>
			{
				response.type('text/plain');
				response.send(game_state);
			});
		}
			
	}

	let handle_list = function(request, response)
	{
		m_model.list_sessions().then((session_list) =>
		{
			let response_string = ""
			for (let session_index in session_list)
			{
				response_string += session_list[session_index]["_id"] + "\n";
			}
			response.type('text/plain');
			response.send(response_string);
		});
	}

	//let handle_action = function(request, response, action_parameters, callback)
	let handle_action = function(request, response)
	{
		if (request.query)
		{
			let [base, session_id, stage, action] = request._parsedUrl.pathname.split("/");
			let player_index = request.query.player;
			let target_index = request.query.target;
			let action_parameters = action_params[action];
			if (!action_parameters)
			{
				response.send("Invalid action");
				return;
			}
			if (request.query.target)
			{
				action_parameters.target = request.query.target;
				console.log("Action target", action_parameters.target);
			}
			m_model.get_session(session_id, function(session, error)
			{
				if (error)
				{
					response.send(error);
					return;
				}
				console.log("handle_action", action, "player_index", player_index, "current turn", session.current_turn);
				if (player_index != session.current_turn)
				{
					response.send("Error:Not current player's turn(400)");
				}
				else if (session.players[player_index].coins > 10 && action_parameters.cost != 7)
				{
					response.send("Error:Player with 10 or more coins must coup");
				}
				else
				{
					session.pay_coins(player_index, action_parameters.cost).then( (result) =>
					{
						// Notify other players, check for challenge
						let action_success_flag = true;
						// Resolve challenge (check to see if character is in player's hand, lose influence for player or challenger)
						if (action_parameters.proved_by != null)
						{
							session.advance_stage("challenge", action_parameters).then( (game_state) =>
							{
								response.send(game_state);
								return;
							});
						}
						// Resolve counteraction (check to see if character is in player's hand, lose influence for player or challenger)
						else if (action_parameters.blocked_by != [])
						{
							session.advance_stage("counteract", action_parameters).then( (game_state) =>
							{
								response.send(game_state);
								return;
							});
						}
						else if (action_success_flag == true)
						{
							console.log("success");
							action_parameters.callback(session, player_index, action_parameters).then( (game_state) =>
							{
								response.send(game_state);
							});
						}
					})
					.catch( (error) =>
					{
						if (error == "not enough coins")
						{
							response.send("Error:Not enough coins to complete action");
						}
						else
						{
							response.send(error);
						}
					});
				}
			});
		}
		else
		{
			response.send("Error:Invalid action(400)");
		}
	}

	let handle_challenge = function(request, response)
	{
		if (request.query)
		{
			let [base, session_id, action] = request.url.split("/");
			let challenger_index = request.query.challenger;
			m_model.get_session(session_id, function(session, error)
			{
				let player_index = session.entry.current_turn;
				let action_parameters = action_params[session.entry.current_action];
				console.log(session_id, "challenge", session.entry.current_action, "player", session.entry.current_turn, action_parameters);
				if (error)
				{
					response.send(error);
				}
				let proved_flag = false;
				let proved_by = null;
                if (challenger_index < 0 || challenger_index == undefined)
				{
					session.advance_stage("counteract", action_parameters).then( (game_state) =>
					{
						response.send(game_state);
						return;
					});
				}
				else
				{
					if (!action_parameters[session.entry.current_action])
					{
						response.send("Error: Action " + session.entry.current_action + " can not be challenged");
						return;
					}
                	for (let proved_card of action_parameters[session.entry.current_action].proved_by)
					{
						if (proved_card in session.players[player_index].cards)
						{
							proved_flag = true;
							proved_by = proved_card;
						}
						else
						{
							console.log("player does not have influence", proved_card, "actual", session.players[player_index].cards);
						}
					}
					action_parameters["proved_by"] = proved_by;
					action_parameters["proved_flag"] = proved_flag;
					action_parameters["challenger"] = challenger_index;
					if (proved_flag == true)
					{
						// Player wins challenge by proving required influence.
						// Challenger immediately loses influence
						session.advance_stage("lose_influence", action_parameters).then( (game_state) =>
						{
 							// Now revealed card is returned to court deck, shuffle and player takes a random replacement card
							session.lose_influence(player_index, proved_card, false).then( (game_state) =>
							{
								session.draw_card(player_index).then( (game_state) =>
								{
									response.send(game_state);
									return;
								});
							});
						});
					}
					else
					{
						// Challenger wins challenge
						// Player loses challenge by not proving required influence, immediately loses influence and action fails
						session.advance_stage("lose_influence", action_parameters).then( (game_state) =>
						{
							response.send(game_state);
							return;
						});
					}
				}
			});
			
		}
	}

	let handle_counteract = function(request, response)
	{
		if (request.query)
		{
			let [base, session_id, action] = request.url.split("/");
			let challenger_index = request.query.challenger;
			m_model.get_session(session_id, function(session, error)
			{
				let player_index = session.entry.current_turn;
				let action_parameters = action_params[session.entry.current_action];
				if (session.entry.current_target)
				{
					action_parameters.target = session.entry.current_target;
				}
				console.log(session_id, "counteract", session.entry.current_action, "player", session.entry.current_turn);
				if (error)
				{
					response.send(error);
				}
				let proved_flag = false;
				let proved_by = null;
                if (challenger_index < 0 || challenger_index == undefined)
				{
					// No challengers
					session.advance_stage("resolve_action", action_parameters).then( (game_state) =>
					{
						console.log("counteract resolve", action_parameters, player_index);
						action_parameters.callback(session, player_index, action_parameters).then( (game_state) =>
						{
							session.advance_turn(action_parameters).then( (game_state) =>
							{
								response.send(game_state);
								return;
							});
						});
					});
				}
				else
				{
					let blocking_influence = request.query.blocking_influence;
					if (blocking_influence in action_parameters.blocked_by)
					{
						session.advance_turn(action_parameters).then( (game_state) =>
						{
							response.send(game_state);
							return;
						});
					}
					else
					{
						response.send("Action [" + session.entry.current_action + "] can't be blocked by " + blocking_influence);
					}
				}
			});
		}
	}

	let handle_status = function(request, response)
	{
		let [base, session_id, action] = request.url.split("/");
		m_model.get_session(session_id, (session, error) =>
		{
			if (session)
			{
				response.send(session.entry);
			}
			else
			{
				response.send(error);
			}
		});
	}

	let handle_lose_influence = function(request, response)
	{
		let [base, session_id, action] = request.url.split("/");
		m_model.get_session(session_id, (session, error) =>
		{
			if (session)
			{
				// TODO: better error checking: Only valid if Coup, Assassinate, or Exchange just succeeded.
				//  if coup or assassinate, there is a target, and reveal should be true. If exchange, reveal is false
				let player_index = request.query.player;
				let character = request.query.character;
				let reveal_flag = false;
				if (session.entry.current_target && (session.entry.current_action == "coup" || session_entry.current_action == "assassinate"))
				{
					reveal_flag = true;
				}
				else if (session.entry.current_action == "coup")
				{
					reveal_flag = false;
				}
				else
				{
					response.send("lose_influence only valid after successful coup, assassinate, or exchange");
					return;
				}
				session.lose_influence(player_index, character, reveal_flag).then( (game_state) =>
				{
					response.send(game_state);
				});
			}
			else
			{
				response.send(error);
			}
		});
	}

	//public methods
	// Called from parent to initialize socket communications and handlers
	this.start = function(port, model)
	{
		m_port = port;
		m_model = model;
		const app = express();
 
		//pass in your express app and credentials to create an https server
		//var https_server = https.createServer(credentials, app);
		var http_server = http.createServer(app);
		app.use('/', express.static(__dirname + '/public'));
		app.get('/setup', handle_setup);
		app.get('/list', handle_list);
		app.get('/*/status', handle_status);
		app.get('/*/action/*', handle_action);
		app.get('/*/challenge', handle_challenge);
		app.get('/*/counteract', handle_counteract);
		app.get('/*/lose_influence', handle_lose_influence);
		app.get('/*/end_game', handle_end_game);
		http_server.listen(port);
	};

};


module.exports = CoupController;

