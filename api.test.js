const http = require('http');
const base_url = "http://localhost:6080/"

async function call_api(method, callback)
{
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


test('sanity check 1+2=3', () =>
{
	expect( 1 + 2 ).toBe(3);
});

test('setup test', () =>
{
	return call_api("setup").then( (result) =>
	{
		expect( result ).not.toBeNull();
		expect( result['_id'] ).toBeDefined();
		expect( result['start_timestamp'] ).toBeDefined();
		expect( result['treasury'] ).toBeDefined();
		expect( result['num_players'] ).toBeDefined();
		expect( result['players'] ).toBeDefined();
		expect( result['players'].length ).toEqual( result['num_players'] );
		expect( result['court_deck'] ).toBeDefined();
		expect( result['revealed_cards'] ).toBeDefined();
		expect( result['revealed_cards'].length ).toEqual(0);
		expect( result['current_turn'] ).toBe(0);
		expect( result['current_stage'] ).toBe('action');
		expect( result['current_action'] ).toBe('pending');
		expect( result['message'] ).toBeDefined();
	});
});

test('list test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];
	try
	{
		const list_result = await call_api("list");
		expect(list_result).toContain(session_id);
	}
	catch (error)
	{
		expect(error).not.toBeDefined();
	}
});

test('end_game test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];
	const end_game_result = await call_api(session_id + "/end_game");
	expect( end_game_result['_id'] ).toBeDefined();
	expect( end_game_result['_id'] ).toEqual(session_id);
	expect( end_game_result['num_deleted'] ).toEqual(1);
});

test('tax action test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	const tax_noplayer_result = await call_api(session_id + "/action/tax");
	expect( tax_noplayer_result['Error'] ).toBeDefined();

	const tax_result = await call_api(session_id + "/action/tax?player=0");
	expect( tax_result['_id'] ).toEqual(session_id);
	expect( tax_result['current_turn'] ).toBe(0);
	expect( tax_result['current_stage'] ).toBe('challenge');
	expect( tax_result['current_action'] ).toBe('tax');

	const challenge_result = await call_api(session_id + "/challenge");
	expect( challenge_result['_id'] ).toEqual(session_id);
	// Tax can not be blocked, so proceed to resolving turn and advanceing to next
	// After success, coins increase from 2 + 3 = 5
	expect( challenge_result['players'][0].coins ).toBe(5);
	expect( challenge_result['current_turn'] ).toBe(1);
	expect( challenge_result['current_stage'] ).toBe('action');
	expect( challenge_result['current_action'] ).toBe('pending');
});

test('foreign_aid action test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	const foreign_aid_noplayer_result = await call_api(session_id + "/action/foreign_aid");
	expect( foreign_aid_noplayer_result['Error'] ).toBeDefined();

	const foreign_aid_result = await call_api(session_id + "/action/foreign_aid?player=0");
	expect( foreign_aid_result['_id'] ).toEqual(session_id);
	expect( foreign_aid_result['current_turn'] ).toBe(0);
	expect( foreign_aid_result['current_action'] ).toBe('foreign_aid');
	// foreign aid is a general action, so can not be challenged
	expect( foreign_aid_result['current_stage'] ).toBe('counteract');
	const counteract_result = await call_api(session_id + "/counteract");
	expect( counteract_result['_id'] ).toEqual(session_id);
	// After success, coins increase from 2 + 2 = 4
	expect( counteract_result['players'][0].coins ).toBe(4);
	expect( counteract_result['current_turn'] ).toBe(1);
	expect( counteract_result['current_stage'] ).toBe('action');
	expect( counteract_result['current_action'] ).toBe('pending');
});

test('income action test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	const income_noplayer_result = await call_api(session_id + "/action/income");
	expect( income_noplayer_result['Error'] ).toBeDefined();

	const income_result = await call_api(session_id + "/action/income?player=0");
	expect( income_result['_id'] ).toEqual(session_id);
	// income is a general action, and can't be blocked, so it automatically succeeds!
	// After success, coins increase from 2 + 1 = 3
	expect( income_result['players'][0].coins ).toBe(3);
	expect( income_result['current_turn'] ).toBe(1);
	expect( income_result['current_stage'] ).toBe('action');
	expect( income_result['current_action'] ).toBe('pending');
});

test('steal action test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	const steal_noplayer_result = await call_api(session_id + "/action/steal");
	expect( steal_noplayer_result['Error'] ).toBeDefined();

	const steal_notarget_result = await call_api(session_id + "/action/steal?player=0");
	expect( steal_noplayer_result['Error'] ).toBeDefined();

	const steal_result = await call_api(session_id + "/action/steal?player=0&target=1");
	expect( steal_result['_id'] ).toEqual(session_id);
	expect( steal_result['current_turn'] ).toBe(0);
	expect( steal_result['current_stage'] ).toBe('challenge');
	expect( steal_result['current_action'] ).toBe('steal');

	const challenge_result = await call_api(session_id + "/challenge");
	expect( challenge_result['_id'] ).toEqual(session_id);
	expect( challenge_result['current_stage'] ).toBe('counteract');

	const counteract_result = await call_api(session_id + "/counteract");
	expect( counteract_result['_id'] ).toEqual(session_id);
	// After success, coins increase from 2 + 2 = 4
	expect( counteract_result['players'][0].coins ).toBe(4);
	expect( counteract_result['players'][1].coins ).toBe(0);
	expect( counteract_result['current_turn'] ).toBe(1);
	expect( counteract_result['current_stage'] ).toBe('action');
});

test('exchange action test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	const exchange_noplayer_result = await call_api(session_id + "/action/exchange");
	expect( exchange_noplayer_result['Error'] ).toBeDefined();

	const exchange_result = await call_api(session_id + "/action/exchange?player=0");
	expect( exchange_result['_id'] ).toEqual(session_id);
	expect( exchange_result['current_turn'] ).toBe(0);
	expect( exchange_result['current_stage'] ).toBe('challenge');
	expect( exchange_result['current_action'] ).toBe('exchange');

	const challenge_result = await call_api(session_id + "/challenge");
	expect( challenge_result['_id'] ).toEqual(session_id);
	expect( challenge_result['current_stage'] ).toBe('lose_influence');

	// After success, number of cards should now be 4
	expect( challenge_result.players[0].cards.length ).toEqual(4);
	// now lose_influence needs to be called twice to get back down to 2 cards
	const lose_influence_result = await call_api(session_id + "/lose_influence?player=0&character=" + challenge_result.players[0].cards[0]);
	expect( lose_influence_result['_id'] ).toEqual(session_id);
	expect( lose_influence_result.players[0].cards.length ).toEqual(3);
	const second_lose_influence_result = await call_api(session_id + "/lose_influence?player=0&character=" + lose_influence_result.players[0].cards[0]);
	expect( second_lose_influence_result['_id'] ).toEqual(session_id);
	expect( second_lose_influence_result.players[0].cards.length ).toEqual(2);

	expect( second_lose_influence_result['current_turn'] ).toBe(1);
	expect( second_lose_influence_result['current_stage'] ).toBe('action');
	expect( second_lose_influence_result['current_action'] ).toBe('pending');
});

test('assassinate action test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	// First do a dummy round where everyone takes income in order to get enough coins
	for (let turn=0; turn<setup_result.players.length; turn++)
	{
		const income_result = await call_api(session_id + "/action/income?player="+turn);
		expect( income_result['_id'] ).toEqual(session_id);
		expect( income_result['players'][turn].coins ).toBe(3);
	}

	const assassinate_result = await call_api(session_id + "/action/assassinate?player=0&target=1");
	expect( assassinate_result['_id'] ).toEqual(session_id);
	expect( assassinate_result['current_turn'] ).toBe(0);
	expect( assassinate_result['current_stage'] ).toBe('challenge');
	expect( assassinate_result['current_action'] ).toBe('assassinate');
	expect( assassinate_result['current_target'] ).toBe(1);

	const challenge_result = await call_api(session_id + "/challenge");
	expect( challenge_result['_id'] ).toEqual(session_id);
	expect( challenge_result['current_stage'] ).toBe('counteract');
	expect( challenge_result['current_target'] ).toBe(1);

	const counteract_result = await call_api(session_id + "/counteract");
	expect( counteract_result['_id'] ).toEqual(session_id);
	expect( counteract_result['current_target'] ).toBe(1);
	// After success, number of coins sould be 3, target asked to lose influence
	expect( counteract_result['current_stage'] ).toBe('lose_influence');
	expect( counteract_result['players'][0].coins ).toBe(0);
	// now lose_influence needs to be called by the target to complete the assassinate action
	const lose_influence_result = await call_api(session_id + "/lose_influence?player=1&character=" + challenge_result.players[1].cards[0]);
	expect( lose_influence_result['_id'] ).toEqual(session_id);
	expect( lose_influence_result.players[1].cards.length ).toEqual(1);

	expect( lose_influence_result['current_turn'] ).toBe(1);
	expect( lose_influence_result['current_stage'] ).toBe('action');
	expect( lose_influence_result['current_action'] ).toBe('pending');
});

test('coup action test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	// First do 2 dummy rounds where everyone takes tax in order to get enough coins
	for (let turn=0; turn<setup_result.players.length; turn++)
	{
		const tax_result = await call_api(session_id + "/action/tax?player="+turn);
		const challenge_result = await call_api(session_id + "/challenge");
		expect( challenge_result['_id'] ).toEqual(session_id);
		expect( challenge_result['players'][turn].coins ).toBe(5);
	}
	for (let turn=0; turn<setup_result.players.length; turn++)
	{
		const tax_result = await call_api(session_id + "/action/tax?player="+turn);
		const challenge_result = await call_api(session_id + "/challenge");
		expect( challenge_result['_id'] ).toEqual(session_id);
		expect( challenge_result['players'][turn].coins ).toBe(8);
	}

	const coup_result = await call_api(session_id + "/action/coup?player=0&target=1");
	expect( coup_result['_id'] ).toEqual(session_id);
	expect( coup_result['current_turn'] ).toBe(0);
	expect( coup_result['current_action'] ).toBe('coup');
	expect( coup_result['current_target'] ).toBe(1);

	// After success, number of coins sould be 1, target asked to lose influence
	expect( coup_result['current_stage'] ).toBe('lose_influence');
	expect( coup_result['players'][0].coins ).toBe(1);
	// now lose_influence needs to be called by the target to complete the coup action
	const lose_influence_result = await call_api(session_id + "/lose_influence?player=1&character=" + coup_result.players[1].cards[0]);
	expect( lose_influence_result['_id'] ).toEqual(session_id);
	expect( lose_influence_result.players[1].cards.length ).toEqual(1);

	expect( lose_influence_result['current_turn'] ).toBe(1);
	expect( lose_influence_result['current_stage'] ).toBe('action');
	expect( lose_influence_result['current_action'] ).toBe('pending');

    // Also check for side effects by retaliation from the next player
	const coup_result_2 = await call_api(session_id + "/action/coup?player=1&target=0");
	expect( coup_result_2['_id'] ).toEqual(session_id);
	expect( coup_result_2['current_turn'] ).toBe(1);
	expect( coup_result_2['current_action'] ).toBe('coup');
	expect( coup_result_2['current_target'] ).toBe(0);
	expect( coup_result_2['current_stage'] ).toBe('lose_influence');
	expect( coup_result_2['players'][1].coins ).toBe(1);
	const lose_influence_result_2 = await call_api(session_id + "/lose_influence?player=0&character=" + coup_result.players[0].cards[0]);
	expect( lose_influence_result_2['_id'] ).toEqual(session_id);
	expect( lose_influence_result_2.players[0].cards.length ).toEqual(1);
	expect( lose_influence_result_2['current_turn'] ).toBe(2);
	expect( lose_influence_result_2['current_stage'] ).toBe('action');
	expect( lose_influence_result_2['current_action'] ).toBe('pending');

}, 20000);

test('block foreign aid test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	const foreign_aid_result = await call_api(session_id + "/action/foreign_aid?player=0");
	expect( foreign_aid_result['_id'] ).toEqual(session_id);
	expect( foreign_aid_result['current_turn'] ).toBe(0);
	expect( foreign_aid_result['current_action'] ).toBe('foreign_aid');
	// foreign aid is a general action, so can not be challenged
	expect( foreign_aid_result['current_stage'] ).toBe('counteract');
	const counteract_result = await call_api(session_id + "/counteract?challenger=1&blocking_influence=Duke");
	expect( counteract_result['_id'] ).toEqual(session_id);
	// After successful block, coins remain at 2 (should not increase to 4)
	expect( counteract_result['players'][0].coins ).toBe(2);
	expect( counteract_result['current_turn'] ).toBe(1);
	expect( counteract_result['current_stage'] ).toBe('action');
	expect( counteract_result['current_action'] ).toBe('pending');
});

test('block assassinate test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	// First do a dummy round where everyone takes income in order to get enough coins
	for (let turn=0; turn<setup_result.players.length; turn++)
	{
		const income_result = await call_api(session_id + "/action/income?player="+turn);
		expect( income_result['_id'] ).toEqual(session_id);
		expect( income_result['players'][turn].coins ).toBe(3);
	}

	const assassinate_result = await call_api(session_id + "/action/assassinate?player=0&target=1");
	expect( assassinate_result['_id'] ).toEqual(session_id);
	expect( assassinate_result['current_turn'] ).toBe(0);
	expect( assassinate_result['current_stage'] ).toBe('challenge');
	expect( assassinate_result['current_action'] ).toBe('assassinate');
	expect( assassinate_result['current_target'] ).toBe(1);

	const challenge_result = await call_api(session_id + "/challenge");
	expect( challenge_result['_id'] ).toEqual(session_id);
	expect( challenge_result['current_stage'] ).toBe('counteract');
	expect( challenge_result['current_target'] ).toBe(1);

	const counteract_result = await call_api(session_id + "/counteract?challenger=1&blocking_influence=Contessa");
	expect( counteract_result['_id'] ).toEqual(session_id);
	// After successful block, coins are spent, but no influence lost
	expect( counteract_result['players'][0].coins ).toBe(0);
    expect( counteract_result.players[1].cards.length ).toEqual(2);
	expect( counteract_result['current_turn'] ).toBe(1);
	expect( counteract_result['current_stage'] ).toBe('action');
	expect( counteract_result['current_action'] ).toBe('pending');
});


test('block steal test', async () =>
{
	const setup_result = await call_api("setup");
	expect( setup_result['_id'] ).toBeDefined();
	const session_id = setup_result['_id'];

	const steal_result = await call_api(session_id + "/action/steal?player=0&target=1");
	expect( steal_result['_id'] ).toEqual(session_id);
	expect( steal_result['current_turn'] ).toBe(0);
	expect( steal_result['current_stage'] ).toBe('challenge');
	expect( steal_result['current_action'] ).toBe('steal');

	const challenge_result = await call_api(session_id + "/challenge");
	expect( challenge_result['_id'] ).toEqual(session_id);
	expect( challenge_result['current_stage'] ).toBe('counteract');

	const counteract_result = await call_api(session_id + "/counteract?challenger=1&blocking_influence=Captain");
	expect( counteract_result['_id'] ).toEqual(session_id);
	// After successful block, no coins stolen
	expect( counteract_result['players'][0].coins ).toBe(2);
	expect( counteract_result['players'][1].coins ).toBe(2);
	expect( counteract_result['current_turn'] ).toBe(1);
	expect( counteract_result['current_stage'] ).toBe('action');
	expect( counteract_result['current_action'] ).toBe('pending');

	const steal_result_2 = await call_api(session_id + "/action/steal?player=1&target=2");
	expect( steal_result_2['_id'] ).toEqual(session_id);
	expect( steal_result_2['current_turn'] ).toBe(1);
	expect( steal_result_2['current_stage'] ).toBe('challenge');
	expect( steal_result_2['current_action'] ).toBe('steal');

	const challenge_result_2 = await call_api(session_id + "/challenge");
	expect( challenge_result_2['_id'] ).toEqual(session_id);
	expect( challenge_result_2['current_stage'] ).toBe('counteract');

	const counteract_result_2 = await call_api(session_id + "/counteract?challenger=2&blocking_influence=Ambassador");
	expect( counteract_result_2['_id'] ).toEqual(session_id);
	// After successful block, no coins stolen
	expect( counteract_result_2['players'][1].coins ).toBe(2);
	expect( counteract_result_2['players'][2].coins ).toBe(2);
	expect( counteract_result_2['current_turn'] ).toBe(2);
	expect( counteract_result_2['current_stage'] ).toBe('action');
	expect( counteract_result_2['current_action'] ).toBe('pending');
}, 10000);

