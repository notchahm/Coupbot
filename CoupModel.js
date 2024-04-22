// CoupModel.js
// This contains the server-side model for the Coup API

const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const mongo_mock = require('mongo-mock');

// This is the JavaScript model object for the game, which serves as an abstraction for the data interface
// The current implementation uses a MongoDB as persistent storage of the game state
//const model = function CoupModel()
class CoupSession
{
	constructor(collection, db_entry)
	{
		this.character_list = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];
		this.num_copies = 3;	 //Number of copies of each card -- TODO: make configurable per session with default
		this.collection = collection;
		if (db_entry)
		{
			this.db_entry = db_entry;
		}
		else
		{
			this.setup(collection);
		}
	}

	get session_id()
	{
		return this.db_entry._id;
	}

	get current_turn()
	{
		return this.db_entry.current_turn;
	}

	get current_stage()
	{
		return this.db_entry.current_stage;
	}

	get current_action()
	{
		return this.db_entry.current_action;
	}

	get current_target()
	{
		return this.db_entry.current_target;
	}

	get players()
	{
		return this.db_entry.players;
	}

	get entry()
	{
		return this.db_entry;
	}

	shuffle(array)
	{
		let currentIndex = array.length;
		// While there remain elements to shuffle...
		while (currentIndex != 0)
		{
			// Pick a remaining element...
			let randomIndex = Math.floor(Math.random() * currentIndex);
			currentIndex--;
			// And swap it with the current element.
			[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
		}
		return array;
	}

	setup(collection)
	{
		//As defined in the Coup manual:
		// Set-Up:
		let random_id = crypto.randomBytes(8).toString('hex');
		let new_session = {
			_id: random_id,
			start_timestamp: Date.now(),
			treasury: 50,
			num_players: 4,	//TODO read from setup params
			players: [],
			court_deck: [],
			revealed_cards: [],
			current_turn: 0,
			current_stage: "action",
			current_action: "pending",
			message: "Game Started! Player 0 take action."
		};
		// "Shuffle all the character cards and deal 2 to each player"
		// "All the cards" = 15 charcter cards, 3 of each Duke, Assassin, Captain, Ambassador, Contessa)
		for (let repetition_index = 0; repetition_index < this.num_copies; repetition_index++)
		{
			for (let character_index = 0; character_index < this.character_list.length; character_index++)
			{
				new_session.court_deck.push(this.character_list[character_index]);	
			}
		}
		// "Deal 2 to each player", also "Give each player 2 coins"
		for (let player_index = 0; player_index < new_session.num_players; player_index++)
		{
			new_session.players.push({"name":"player"+player_index,"cards":[], "coins":2});
			new_session.treasury -= 2;
		}
		for (let player_index = 0; player_index < new_session.num_players; player_index++)
		{
			this.draw_card(new_session, player_index, 2);
		}
		//collection.insertOne(new_session);
		return new_session;
	}

	take_coins(player_index, num_coins)
	{
		//console.log("take coins: player", player_index, num_coins);
		let result_promise = new Promise( (resolve, reject) =>
		{
			this.pull_db( (session, error) =>
			{
				if (error)
				{
					reject(error);
				}
				if (session.treasury >= num_coins)
				{
					session.treasury -= num_coins;
					session.message = num_coins + " coins taken from treasury!";
					session.players[player_index].coins += num_coins;
				}
				else
				{
					// Not enough coins in treasury, just take remainder
					session.players[player_index].coins += session.treasury;
					session.message = session.treasury + " coins taken from treasury!";
					session.treasury = 0;
				}
				this.db_entry = session;
				this.push_db( (push_result) => { resolve(session); });
			});
		});
		return result_promise;
	}

	pay_coins(player_index, num_coins)
	{
		//console.log("pay coins: player", player_index, num_coins);
		let result_promise = new Promise( (resolve, reject) =>
		{
			this.pull_db( (session, error) =>
			{
				if (error)
				{
					console.log("pay coins error", error);
					reject(error);
				}
				if (session.players[player_index].coins >= num_coins)
				{
					session.treasury += num_coins;
					session.players[player_index].coins -= num_coins;
					this.db_entry = session;
					this.push_db( (push_result) => { resolve(session); });
				}
				else
				{
					console.log("not enough coins");
					reject(0);
				}
			});
		});
		return result_promise;
	}

	steal_coins(player_index, num_coins, action_parameters)
	{
		//console.log("steal coins: player", player_index);
		let result_promise = new Promise( (resolve, reject) =>
		{
			if (num_coins <= 0)
			{
				reject("invalid amount");
			}
			this.pay_coins(action_parameters.target, num_coins).then( (result) => 
			{
				this.take_coins(player_index, num_coins).then( (game_state) => 
				{
					resolve(game_state);
				})
				.catch( (error) =>
				{
					reject(error);
				});
			})
			.catch( (error) =>
			{
				if (error == "not enough coins")
				{
					// If the target only has 1 coin, take 1 coin, handle with recursion
					this.steal_coins(player_index, num_coins-1, action_parameters).then( (result) =>
					{
						resolve(game_state);
					})
					.catch( (error) =>
					{
						reject(error);
					});
				}
				else
				{
					reject(error);
				}
			});
		});
		return result_promise;
	}

	exchange_cards(player_index, num_cards, action_parameters)
	{
		let result_promise = new Promise( (resolve, reject) =>
		{
			this.draw_card(null,player_index,num_cards).then( (session) =>
			{
				session.num_cards_before_exchange = session.players[player_index].cards.length - num_cards;
				this.db_entry = session;
				this.push_db( (push_result) => 
				{
					this.advance_stage("lose_influence", action_parameters).then( (session) =>
					{
						resolve(session);
					})
					.catch((error) =>
					{
						reject(error);
					});
				});
			})
			.catch( (error) =>
			{
				reject(error);
			});
		});
		return result_promise
	}

	draw_card(session, player_index, num_cards)
	{
		if (!session)
		{
			let result_promise = new Promise( (resolve, reject) =>
			{
				this.pull_db( (session, error) =>
				{
					this.draw_card(session, player_index, num_cards);
					this.push_db( (push_result) => { resolve(session); });
				});
			});
			return result_promise;
		}
		else
		{
			session.court_deck = this.shuffle(session.court_deck);
			for (let card_index=0; card_index < num_cards; card_index++)
			{
				session.players[player_index].cards.push(session.court_deck.pop());
			}
			this.db_entry = session;
		}
	}

	prompt_lose_influence(player_index, action_parameters)
	{
		console.log("lose influence", player_index);
		let result_promise = new Promise( (resolve, reject) =>
		{
			this.pull_db( (session, error) =>
			{
				if (error)
				{
					reject(error);
				}
				this.advance_stage("lose_influence", action_parameters).then( (session) =>
				{
					resolve(session);
				})
				.catch((error) =>
				{
					reject(error);
				});
			});
		});
		return result_promise;
	}

	find_card(session, player_index, character_type)
	{
		//console.log(session.players, player_index);
		for (let card_index = 0; card_index < session.players[player_index].cards.length; card_index++)
		{
			if (session.players[player_index].cards[card_index] == character_type)
			{
				return card_index;
			}
		}
		return null;
	}

	lose_influence(player_index, character_type, reveal_flag)
	{
		console.log("lose influence: player", player_index, character_type);
		let result_promise = new Promise( (resolve, reject) =>
		{
			this.pull_db( (session, error) =>
			{
				if (error)
				{
					reject(error);
				}
				let card_index = this.find_card(session, player_index, character_type);
				if (card_index != null)
				{
					session.players[player_index].cards.splice(card_index,1);
					if (reveal_flag == true)
					{
						session.revealed_cards.push(character_type);
					}
					else
					{
						session.court_deck.push(character_type);
					}
					this.db_entry = session;
					this.push_db( (push_result) => 
					{ 
						if (session.players[player_index].cards.length == 0)
						{
							//When a player has lost all their inflence...
							// They leave their cards face up and return all their coins to the Treasury
							this.pay_coins(player_index, session.players[player_index].coins).then( (session) =>
							{
								resolve(session);
							});
						}
						else
						{
							resolve(session);
						}
					});
				}
				else
				{
					reject("influence card not found in player's hand");
				}
			});
		});
		return result_promise;
	}

	advance_stage(new_stage, action_parameters)
	{
		console.log("advance_stage", new_stage, action_parameters.name);
		let result_promise = new Promise( (resolve, reject) =>
		{
			this.pull_db( (session, error) =>
			{
				if (error)
				{
					reject(error);
				}
				let prev_stage = session.current_stage;
				session.current_stage = new_stage;
				session.current_action = action_parameters.name;
				let action_description = "action [" + action_parameters.name + "]";
				if (action_parameters.target)
				{
					session.current_target = parseInt(action_parameters.target);
					action_description += " with target [" + action_parameters.target + "]";
				}
				if (action_parameters.proved_by)
				{
					action_description += " proved by [" + action_parameters.proved_by + "]";
				}
				else
				{
					action_description += " which can not be challenged";
				}
				if (new_stage == "challenge")
				{
					session.message = "Player " + session.current_turn + " has chosen " + action_description + ". Any player may issue a challenge, or submit no challenges to continue";
				}
				else if (new_stage == "counteract")
				{
					session.message = "Player " + session.current_turn + " has chosen " + action_description + ". Any player may attempt to block with [" + action_parameters.blocked_by + "], or submit no counteraction to continue";
				}
				else if (new_stage == "lose_influence")
				{
					if (prev_stage == "challenge")
					{
						if (action_parameters.proved_flag == false)
						{
							session.message = "Challenge succeeded, player " + session.current_player + " lose influence";
						}
						else
						{
							session.message = "Challenge failed, player " + action_parameters.challenger_index + " lose influence; Player " + session.current_player + " reveals " + action_parameters.proved_by + " and has drawn a new card from court deck";
						}
					}
					else if (action_parameters.name == "exchange")
					{
						// Coup or assassinate
						session.message = action_parameters.name + " succeeded, player " + session.current_player + " return 2 cards ";
					}
					else if (action_parameters.target)
					{
						// Coup or assassinate
						session.message = action_parameters.name + " succeeded, player " + action_parameters.target + " lose influence";
					}
				}
				else if (new_stage == "resolve_action")
				{
					session.message = "Player " + session.current_turn + " has succeeded action [" + session.current_action + "]!";
				}
				this.db_entry = session;
				this.push_db( (push_result) => { resolve(session); });
			});
		});
		return result_promise;
	}

	advance_turn = function(action_parameters)
	{
		console.log("advance turn");
		let result_promise = new Promise( (resolve, reject) =>
		{
			this.pull_db( (session, error) =>
			{
				if (error)
				{
					reject(error);
				}
				let new_turn = (session.current_turn + 1) % session.num_players;
				while (session.players[new_turn].cards.length < 1)
				{
					// Skip players who have no cards left
					new_turn = (new_turn + 1) % session.num_players;
				}
				if (session.current_target)
				{
					delete session.current_target;
				}
                if (session.num_cards_before_exchange)
				{
					delete session.num_cards_before_exchange;
				}
				session.current_stage = 'action';
				session.current_action = 'pending';
				session.current_turn = new_turn;
				session.message += " Player " + session.current_turn + " take action."
				this.db_entry = session;
				this.push_db( (push_result) => { resolve(session); });
			});
		});
		return result_promise;
	}

	pull_db(callback)
	{
		this.collection.find({"_id":this.db_entry._id}).toArray()
		.then( (session_list) =>
		{
			this.db_entry = session_list[0];
			callback(this.db_entry, null);
		})
		.catch((error) =>
		{
			callback({}, error);
		});
	}

	push_db(callback)
	{
		this.collection.updateOne({"_id":this.db_entry._id}, { $set: this.db_entry})
		.then( (update_result) =>
		{
			callback(update_result);
		})
		.catch((error) =>
		{
			callback(error);
		});
	}
}

class CoupModel
{
	constructor(server, db_uri)
	{
		if (db_uri == null)
		{
			this.db_uri = "mongodb://127.0.0.1:27017/coup";
			this.mock_flag = true;	//Use mock db by default instead of assuming external mongodb server
		}
		else
		{
			this.db_uri = db_uri + "/coup";
			this.mock_flag = false;
		}
		if (this.mock_flag)
		{
			this.client = mongo_mock.MongoClient;
			this.client.persist="mongo.js";
			this.client.connect(this.db_uri, {}, (error, client) =>
			{
				if (error)
				{
					console.log(error);
				}
				else
				{
					console.log("mock db connected");
					this.db = client.db();
					this.sessions = this.db.collection("sessions");
				}
			});
		}
		else
		{
			this.client = new MongoClient(this.db_uri);
			this.client.connect().then( () =>
			{
				console.log("mongodb connected at " + this.db_uri);
				this.db = this.client.db();
				this.sessions = this.db.collection("sessions");
			})
			.catch( (error) =>
			{
				console.log(error);
			});
		};
	}

	check_victory()
	{
		let players_remaining = 0;
		for (let player_index = 0; player_index < m_num_players; player_index++)
		{
			if (m_players[player_index].cards.length > 0)
			{
				players_remaining++;
			}
		}
		return players_remaining == 1;
	}


	setup_session = function(callback)
	{
		let new_session = new CoupSession(this.sessions, null);
		this.sessions.insertOne(new_session.entry)
		.then( () =>
		{
			this.get_session(new_session.session_id, callback);
		})
		.catch((error) =>
		{
			console.log(error);
			callback({}, error);
		});
	}

	get_session(session_id, callback)
	{
		this.sessions.find({"_id":session_id}).toArray()
		.then( (session_list) =>
		{
			var session = new CoupSession(this.sessions, session_list[0]);
			callback(session, null);
		})
		.catch((error) =>
		{
			console.log(error);
			callback({}, error);
		});
	}

	list_sessions()
	{
		return this.sessions.find({}).toArray();
	}

	end_session(session_id, callback)
	{
		//console.log("end session", {"_id":session_id});
		this.sessions.deleteOne({"_id":session_id})
		.then( (delete_result) =>
		{
			delete_result["_id"] = session_id;
			callback({ "_id": session_id, "num_deleted": delete_result.deletedCount, "result": delete_result.result}, null);
		})
		.catch((error) =>
		{
			console.log(error);
			callback({}, error);
		});
	}

	end_expired()
	{
		let delete_result = this.sessions.deleteMany({});
		return delete_result;
	}
};


module.exports = CoupModel;

