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
		"exchange": { "name":"exchange", "cost":0, "proved_by":["Ambassador"], "blocked_by":[], "callback": (session, player, action) => {return session.exchange_cards(player, 2, action)} }
	};

	let handle_setup = function(request, response)
	{
		let setup_parameters = {};
		if ("num_players" in request.query)
		{
			setup_parameters["num_players"] = request.query.num_players;
		}
		if (m_model)
		{
			m_model.setup_session(setup_parameters, function(game_state)
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
			m_model.end_session(session_id, (game_state) =>
			{
				console.log(game_state);
				response.send(game_state);
			});
		}
			
	}

	let handle_list = function(request, response)
	{
		m_model.list_sessions().then((session_list) =>
		{
			let response_array = []; 
			for (let session_index in session_list)
			{
				response_array.push(session_list[session_index]["_id"]);
			}
			response.type('text/plain');
			response.send(JSON.stringify(response_array));
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
			let action_callback = action_params[action].callback;
			let action_parameters = JSON.parse(JSON.stringify(action_params[action]));	//deep copy
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
					response.send({"Error":error});
					return;
				}
				console.log("handle_action [" + action + "]. player_index: " + player_index + ". current turn: " + session.current_turn);
				if (player_index != session.current_turn)
				{
					console.log("Error: not player " + player_index + " turn. player " + session.current_turn + " turn.");
					response.send("{\"Error\":\"Not current player's turn\"}");
				}
				else if (session.current_stage != "action")
				{
					const error_string = "{\"Error\":\"Not allowed to take action. must [" + session.current_stage + "]\"}";
					console.log(error_string);
					response.send(error_string);
				}
				else if (!action_parameters.target && (action == "coup" || action == "assassinate" || action == "steal"))
				{
					const error_string = "{\"Error\":\"Action [" + action + "] requires a target parameter\"}";
					console.log(error_string);
					response.send(error_string);
				}
				else if (session.players[player_index].coins >= 10 && action_parameters.cost != 7)
				{
					const error_string = "{\"Error\":\"Player with 10 or more coins must coup\"}";
					console.log(error_string);
					response.send(error_string);
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
						else if (action_parameters.blocked_by.length > 0)
						{
							session.advance_stage("counteract", action_parameters).then( (game_state) =>
							{
								response.send(game_state);
								return;
							});
						}
						else if (action_success_flag == true)
						{
							action_callback(session, player_index, action_parameters).then( (game_state) =>
							{
								if (game_state.current_stage == 'lose_influence')
								{
									response.send(game_state);
									return;
								}
								else
								{
									session.advance_turn(action_parameters).then( (game_state) =>
									{
										response.send(game_state);
										return;
									});
								}
							});
						}
					})
					.catch( (error) =>
					{
						if (error == "not enough coins")
						{
							response.send({"Error":"Not enough coins to complete action"});
						}
						else
						{
							response.send({"Error":error});
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
				let action_callback = action_params[session.entry.current_action].callback;
				let action_parameters = JSON.parse(JSON.stringify(action_params[session.entry.current_action]));
				console.log(session_id, "challenge", session.entry.current_action, "player", session.entry.current_turn);
				if (error)
				{
					response.send({"Error":error});
					return;
				}
				else if (session.current_stage != "challenge")
				{
					response.send({"Error": "[" + session.current_stage + "]  is not the correct stage for making challenges"});
					return;
				}
				let proved_flag = false;
				let proved_by = null;
				if (challenger_index < 0 || challenger_index == undefined)
				{
					if (action_parameters.blocked_by.length == 0)
					{
						// Can't be blocked
						session.advance_stage("resolve_action", action_parameters).then( (game_state) =>
						{
							action_callback(session, player_index, action_parameters).then( (game_state) =>
							{
								if (game_state.current_stage != 'resolve_action')
								{
									response.send(game_state);
									return;
								}
								else
								{
									session.advance_turn(action_parameters).then( (game_state) =>
									{
										response.send(game_state);
										return;
									});
								}
							});
						});
					}
					else
					{
						console.log("challenge, can be blocked", action_parameters.blocked_by)
						session.advance_stage("counteract", action_parameters).then( (game_state) =>
						{
							response.send(game_state);
							return;
						});
					}
				}
				else
				{
					if (!action_parameters.proved_by)
					{
						const error_string = ("{\"Error\": \"Action " + session.entry.current_action + " can not be challenged\"}");
						console.log(error_string);
						response.send(error_string);
						return;
					}
					for (let proved_card of action_parameters.proved_by)
					{
						if (session.players[player_index].cards.includes(proved_card))
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
						// Resolve action, then challenger immediately loses influence
						action_callback(session, player_index, action_parameters).then( (game_state) =>
						{
							session.advance_stage("lose_influence", action_parameters).then( (game_state) =>
							{
 								// Now revealed card is returned to court deck, shuffle and player takes a random replacement card
								session.lose_influence(player_index, proved_by, false).then( (game_state) =>
								{
									session.draw_card(null, player_index, 1).then( (game_state) =>
									{
										response.send(game_state);
										return;
									})
									.catch( (error) =>
									{
										response.send({"Error":error});
										return;
									});
								});
							});
						});
					}
					else
					{
						// Challenger loses challenge
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
				let action_callback = action_params[session.entry.current_action].callback;
				let action_parameters = JSON.parse(JSON.stringify(action_params[session.entry.current_action]));	//deep copy
				if (session.entry.current_target)
				{
					action_parameters.target = session.entry.current_target;
				}
				console.log(session_id, "counteract", session.entry.current_action, "player", session.entry.current_turn);
				if (error)
				{
					response.send({"Error":error});
				}
				else if (session.current_stage != "counteract")
				{
					const error_message = {"Error": "[" + session.current_stage + "]  is not the correct stage for taking counteraction"};
					console.log(error_message);
					response.send(error_message);
				}
				let proved_flag = false;
				let proved_by = null;
				if (challenger_index < 0 || challenger_index == undefined)
				{
					// No challengers
					session.advance_stage("resolve_action", action_parameters).then( (game_state) =>
					{
						action_callback(session, player_index, action_parameters).then( (game_state) =>
						{
							if (game_state.current_stage != 'resolve_action')
							{
								response.send(game_state);
								return;
							}
							else
							{
								session.advance_turn(action_parameters).then( (game_state) =>
								{
									response.send(game_state);
									return;
								});
							}
						});
					});
				}
				else if ("blocking_influence" in request.query)
				{
					let blocking_influence = request.query.blocking_influence;
					if (action_parameters.blocked_by.includes(blocking_influence) || blocking_influence == action_parameters.blocked_by)
					{
						session.advance_turn(action_parameters).then( (game_state) =>
						{
							response.send(game_state);
							return;
						});
					}
					else
					{
						const error_message = "Action [" + session.entry.current_action + "] can't be blocked by " + blocking_influence + ". It can blocked by " + action_parameters.blocked_by;
						console.log(error_message);
						response.send(error_message);
					}
				}
				else
				{
					const error_message = "Blocking_influence must be supplied as request_query for counteraction";
					console.log(error_message);
					response.send(error_message);
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
				response.send({"Error":error});
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
				let action_parameters = JSON.parse(JSON.stringify(action_params[session.entry.current_action]));	//deep copy
				let player_index = request.query.player;
				let character = request.query.character;
				let reveal_flag = false;
				let lose_influence_target = null;
				if ("current_target" in session.entry && (session.entry.current_action == "coup" || session.entry.current_action == "assassinate"))
				{
					reveal_flag = true;
					lose_influence_target = session.entry.current_target;
				}
				else if (session.entry.current_action == "exchange")
				{
					reveal_flag = false;
					lose_influence_target = session.entry.current_turn;
				}
				else if ("challenge_loser" in session.entry)
				{
					reveal_flag = true;
					lose_influence_target = session.entry.challenge_loser;
				}
				else
				{
					console.log("invalid lose influence");
					response.send("{\"Error\":\"lose_influence only valid after successful coup, assassinate, or exchange\"}");
					return;
				}
				if (session.entry.current_action == "exchange")
				{
 					if (player_index != session.current_turn)
					{
						response.send("{\"Error\":\"Only current player may return cards during exchange\"}");
						return;
					}
				}
				else if (player_index != lose_influence_target)
				{
					response.send("{\"Error\":\"Only targetted player (" + lose_influence_target + ") may lose influence\"}");
					return;
				}
				else if (!character)
				{
					response.send("{\"Error\":\"character parameter for lose_influence must be specified\"}");
					return;
				}
				else if (session.current_stage != "lose_influence")
				{
					response.send("{\"Error\":\"[" + session.current_stage + "] is not the correct stage for taking action\"}");
					return;
				}
				session.lose_influence(lose_influence_target, character, reveal_flag).then( (game_state) =>
				{
					if (session.entry.current_action == "exchange" && game_state.players[player_index].cards.length > game_state.num_cards_before_exchange)
					{
						// still more cards left to return in exchange
						response.send(game_state);
						return;
					}
					else
					{
						session.advance_turn(action_parameters).then( (game_state) =>
						{
							response.send(game_state);
							return;
						});
					}
				})
				.catch( (error) =>
				{
					response.send({"Error":error});
					return;
				});
			}
			else
			{
				response.send({"Error":error});
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

