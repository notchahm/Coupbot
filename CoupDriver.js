const http = require('http');
const base_url = "http://localhost:6080/"

async function call_api(method, callback)
{
	console.log(method);
	let result_promise = new Promise( (resolve, reject) =>
	{
		const request_url = base_url + method;
		try
		{
			http.get(request_url, (response) =>
			{
				let data = '';
				response.on('data', (chunk) => { data += chunk; });
				response.on('end', (chunk) => { result = JSON.parse(data);  resolve(result); });
				response.on('error', (error) => { reject(error); });
			});
		}
		catch(error)
		{
			reject(error);
		}
	});
	return result_promise;
}

function income_bot(player_index)
{
	var m_player_index = player_index;
	async function call(prompt, info)
	{
		let result_promise = new Promise( (resolve, reject) =>
		{
			let player_index = info.name.substring(6);
			if (info.current_stage == "action" && info.current_action == "pending")
			{
				if (info.coins < 10)
				{
					resolve({"method":"action/income","player":player_index});
				}
				else
				{
					for (let opponent_index = 0; opponent_index < info.opponents.length; opponent_index++)
					{
						if (info.opponents[opponent_index].num_influence > 0)
						{
							const target_index = info.opponents[opponent_index].name.substring(6);
							resolve({"method":"action/coup","player":player_index, "target":target_index});
							break;
						}
					}
				}
			}
			else if (info.current_stage == "challenge")
			{
				resolve(null);
			}
			else if (info.current_stage == "counteract")
			{
				resolve(null);
			}
			else if (info.current_stage == "lose_influence")
			{
				resolve({"method":"lose_influence", "player":player_index, "character":info.cards[0]});
			}
			else{
				console.log("???");
				reject(null);
			}
		});
		return result_promise;
	
	}
	return {call:call};
}

function exchange_bot(player_index)
{
	var m_player_index = player_index;
	var m_num_turns = 0;
	async function call(prompt, info)
	{
		let result_promise = new Promise( (resolve, reject) =>
		{
			let player_index = info.name.substring(6);
			if (info.current_stage == "action" && info.current_action == "pending")
			{
				if (info.coins < 7)
				{
					if (m_num_turns == 0)
					{
						m_num_turns++;
						resolve({"method":"action/tax","player":player_index});
					}
					else
					{
						m_num_turns++;
						if (info.coins < 5 || info.opponents.length == 1)
						{
							resolve({"method":"action/foreign_aid","player":player_index});
						}
						else
						{
							resolve({"method":"action/exchange","player":player_index});
						}
					}
				}
				else
				{
					m_num_turns++;
					let best_opponent = 0;
					for (let opponent_index = 0; opponent_index < info.opponents.length; opponent_index++)
					{
						if (info.opponents[opponent_index].num_influence > info.opponents[opponent_index].num_influence)
						{
							best_opponent = opponent_index;
						}
						else if (info.opponents[opponent_index].num_influence && info.opponents[opponent_index].num_influence && 
							info.opponents[opponent_index].coins > info.opponents[opponent_index].coins)
						{
							best_opponent = opponent_index;							
						}
					}
					target_index = info.opponents[best_opponent].name.substring(6);
					resolve({"method":"action/coup","player":player_index, "target":target_index});
				}
			}
			else if (info.current_stage == "challenge")
			{
				// TODO: challenge duke if block foreign aid
				resolve(null);
			}
			else if (info.current_stage == "counteract" && info.current_turn != m_player_index)
			{
				// block steal and assassinate if targetted
				if (info.current_target == m_player && (info.current_action == "assassinate" || info.current_action == "steal")) 
				{
					if (info.current_action == "assassinate")
					{
						resolve({"method":"counteract", "challenger":player_index, "blocking_influence":"Contessa"});
					}
					else if (info.current_action == "steal")
					{
						resolve({"method":"counteract", "challenger":player_index, "blocking_influence":"Ambassador"});
					}
				}
				else
				{
					resolve(null);
				}
			}
			else if (info.current_stage == "lose_influence")
			{
				// prioritize keeping ambassador and contessa
				let ambassador_index = info.cards.indexOf("Ambassador");
				let contessa_index = info.cards.indexOf("Contessa");
				let discard_index = 0
				for (discard_index = 0; discard_index < info.cards.length; discard_index++)
				{
					if (discard_index != ambassador_index && discard_index != contessa_index)
					{
						break;
					}		
				}
				if (discard_index == info.cards.length)
				{
					// get rid of contessas first
					if (contessa_index != -1)
					{
						discard_index = contessa_index;
					}
					else if (ambassador_index != -1)
					{
						discard_index = ambassador_index;
					}
				}
				resolve({"method":"lose_influence", "player":player_index, "character":info.cards[discard_index]});
			}
			else{
				console.log("???");
				reject(null);
			}
		});
		return result_promise;
	
	}
	return {call:call};
}

function get_player_info(game_state, current_player)
{
	let info = JSON.parse(JSON.stringify(game_state.players[current_player]));
	info.opponents = [];
	for (let player_index=0; player_index<game_state.num_players; player_index++)		
	{
		if (player_index != current_player)
		{
			let filtered_player = JSON.parse(JSON.stringify(game_state.players[player_index]));
			if (filtered_player.cards.length > 0)
			{
				filtered_player.num_influence = filtered_player.cards.length;
				delete filtered_player.cards;
				info.opponents.push(filtered_player);	
			}
		}
	}
	info.num_court_deck_cards = game_state.court_deck.length;
	info.treasury_coins = game_state.treasury;
	info.revealed_cards = game_state.revealed_cards;
	info.current_turn = game_state.current_turn;
	info.current_stage = game_state.current_stage;
	info.current_action = game_state.current_action;
	info.message = game_state.message;
	return info;
}

function get_api_method(session_id, choice_object)
{
	if ("method" in choice_object)
	{
		let method_string = session_id + "/" + choice_object.method;
		let sep_char = "?"
		for (let property in choice_object)
		{
			if (property != "action" && property != "method")
			{
				method_string += sep_char + property + "=" + choice_object[property];
				sep_char = "&";	
			}
		}
		return method_string;
	}
}


(async function()
{
	const setup_result = await call_api("setup?num_players=2");
	const session_id = setup_result['_id'];
	let bots = [];
	for (let player_index = 0; player_index < setup_result.players.length; player_index++)
	{
		if (player_index % 2 == 0)
		{
			let new_bot = income_bot(player_index);
			bots.push(new_bot)	
		}
		else
		{
			let new_bot = exchange_bot(player_index);
			bots.push(new_bot)	
		}
	}
	let game_state = setup_result;
	while("current_turn" in game_state)
	{
		const player_game_info = get_player_info(game_state, game_state.current_turn);
		if (player_game_info.opponents.length == 0)
		{
			// The game is over when no opponents are left
			console.log("Game over! Winner is player" + player_game_info.current_turn);
			break;
		}
		const action_choice = await bots[player_game_info.current_turn].call("action", player_game_info);
		//console.log(action_choice);
		const action_result = await call_api(get_api_method(session_id, action_choice));
		game_state = action_result;
		if (action_result.current_stage == "challenge")
		{
			//console.log(action_result);
			let challenge_choice = null;
			for (let opponent_index = 0; opponent_index < player_game_info.opponents.length && challenge_choice === null; opponent_index++)
			{
				const opponent = player_game_info.opponents[opponent_index].name.substring(6);
				const opponent_game_info = get_player_info(action_result, opponent);
				challenge_choice = await bots[opponent_index].call("challenge", opponent_game_info);
				//console.log("opponent", opponent_game_info, challenge_choice);
			}
			if (challenge_choice === null)
			{
				challenge_choice = {"method":"challenge"};
			}
			const challenge_result = await call_api(get_api_method(session_id, challenge_choice));
			game_state = challenge_result;
			//console.log(game_state);
		}
		if (action_result.current_stage == "counteract")
		{
			//console.log(action_result);
			let challenge_choice = null;
			for (let opponent_index = 0; opponent_index < player_game_info.opponents.length && challenge_choice === null; opponent_index++)
			{
				const opponent = player_game_info.opponents[opponent_index].name.substring(6);
				const opponent_game_info = get_player_info(action_result, opponent);
				counteract_choice = await bots[opponent_index].call("counteract", opponent_game_info);
				//console.log("opponenet", opponent_game_info, counteract_choice);
			}
			if (counteract_choice === null)
			{
				counteract_choice = {"method":"counteract"};
			}
			const counteract_result = await call_api(get_api_method(session_id, counteract_choice));
			game_state = counteract_result;
			//console.log(game_state);
		}
		if (action_result.current_stage == "lose_influence" && "current_target" in game_state)
		{
			const target_game_info = get_player_info(game_state, game_state.current_target);
			const target_choice = await bots[player_game_info.current_turn].call("lose_influence", target_game_info);
			//console.log(target_choice);
			const target_result = await call_api(get_api_method(session_id, target_choice));
			game_state = target_result;
		}
		//const challenge_result = await call_api(session_id + "/challenge");
	}
	
})();
