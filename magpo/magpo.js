// classes and utilities

class WordBag {
    constructor(initial_words) {
        this.words = initial_words;
        this.reshuffle();
    }

    reshuffle() {
        this.words_left = this.words.slice();
        shuffle_array(this.words_left);
    }

    draw_words(draw_count) {
        draw_count = Math.min(draw_count, this.words_left.length);

        if (draw_count <= 0) {
            return [];
        }

        const res = this.words_left.slice(0, draw_count);

        this.words_left = this.words_left.slice(draw_count);

        return res;
    }

    add_words(word_list) {
        this.words = this.words.concat(word_list);
        this.words_left = this.words_left.concat(word_list);
    }
}

function shuffle_array(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const swap_i = Math.floor(Math.random() * (i + 1));
        [array[i], array[swap_i]] = [array[swap_i], array[i]];
    }
}

// initial setup

let word_source_data = {};
let game_config = {
    starting_bag_size: 40,
    booster_size: 10,
    booster_offer_count: 3,
    hand_size: 30,
    rounds: 10,
    line_limit: 8,
    line_char_limit: 50
};
let game_ui = {};
let game_state = {};

function setup_game() {
    console.log("setting up game with config data:", word_source_data);

    game_ui.game_status_label = document.querySelector("#game-status-label");
    game_ui.word_bag_label = document.querySelector("#word-bag-label");
    game_ui.prompt_label = document.querySelector("#prompt-label");
    game_ui.poem_status_label = document.querySelector("#poem-status-label");

    game_ui.booster_choice_modal = document.querySelector("#modal-booster-choice");
    game_ui.booster_reveal_modal = document.querySelector("#modal-booster-reveal");
    game_ui.booster_choice_wrapper = document.querySelector("#booster-choice-wrapper");
    game_ui.last_booster_bag = document.querySelector("#last-booster-bag");

    game_ui.next_round_button = document.querySelector("#button-next-round");
    game_ui.next_round_button.addEventListener("click", next_round_button_clicked);

    game_ui.cur_hand = document.querySelector("#cur-hand");
    game_ui.cur_poem = document.querySelector("#cur-poem");

    game_ui.new_game_button = document.querySelector("#button-new-game");
    game_ui.new_game_button.addEventListener("click", new_game_button_clicked);

    game_ui.shuffle_hand_button = document.querySelector("#button-shuffle-hand");
    game_ui.shuffle_hand_button.addEventListener("click", (e) => shuffle_hand());

    game_ui.end_line_button = document.querySelector("#button-end-line");
    game_ui.end_line_button.addEventListener("click", (e) => end_line());

    game_ui.end_poem_button = document.querySelector("#button-end-poem");
    game_ui.end_poem_button.addEventListener("click", (e) => end_poem());

    new_game();
}

function new_game() {
    game_state = {};
    game_state.cur_round = 0;
    game_state.cur_hand = [];

    clear_cur_poem();

    let starter_words = word_source_data.starter_words.default;
    const optional_count = game_config.starting_bag_size - starter_words.length;
    if (optional_count > 0) {
        const optional_pool = word_source_data.starter_words.optional;
        shuffle_array(optional_pool);
        starter_words = starter_words.concat(optional_pool.slice(0, optional_count));
    }

    game_state.word_bag = new WordBag(starter_words);

    game_state.prompt_pool = word_source_data.prompts.slice();
    shuffle_array(game_state.prompt_pool);

    game_state.prompt_term_pool = {}
    for (const [token, word_list] of Object.entries(word_source_data.prompt_terms)) {
        game_state.prompt_term_pool[token] = word_list.slice();
        shuffle_array(game_state.prompt_term_pool[token]);
    }

    game_state.booster_offer = [];

    start_round(1);
}

// game state actions

function start_round(round_idx) {
    game_state.cur_round = round_idx;

    clear_hand();
    clear_cur_poem();

    select_prompt();
    draw_to_fill_hand();
    grant_prompt_bonus_words();

    update_ui();
}

function clear_hand() {
    game_state.word_hand = [];

    game_state.word_bag.reshuffle();
}

function clear_cur_poem() {
    game_state.cur_line_char_count = 0;
    game_state.cur_line = [];
    game_state.cur_poem = [game_state.cur_line];
}

function select_prompt() {
    for (let i = 0; i < game_state.prompt_pool.length; i++) {
        const prompt = game_state.prompt_pool[i];

        if ((prompt.round_min == null || game_state.cur_round >= prompt.round_min) && (prompt.round_max == null || game_state.cur_round <= prompt.round_max)) {
            game_state.cur_prompt = prompt;

            game_state.prompt_pool.splice(i, 1);

            const re = /[\[](\w+)[\]]/g;
            const replace_tokens = prompt.text.matchAll(re);
            replace_tokens.forEach((token_match, i) => {
                // first element is token with brackets, second is term without brackets
                const target_term_pool = game_state.prompt_term_pool[token_match[1]];
                if (target_term_pool != null)
                {
                    if (target_term_pool.length == 0) {
                        if (word_source_data.prompt_term_pool[token_match[1]] != null && word_source_data.prompt_term_pool[token_match[1]].length > 0) {
                            game_state.prompt_term_pool[token_match[1]] = word_source_data.prompt_term_pool[token_match[1]].slice();
                            shuffle_array(game_state.prompt_term_pool[token_match[1]]);

                            console.log("Term pool for " + token_match[0] + " was empty, but we refilled it from config");
                        }
                        else {
                            console.error("Term pool for " + token_match[0] + " is empty and can't be refilled!");
                        }
                    }

                    if (target_term_pool.length > 0) {
                        const replacement = game_state.prompt_term_pool[token_match[1]].pop();
                        prompt.text = prompt.text.replace(token_match[0], replacement);
                    }
                    else {
                        prompt.text = prompt.text.replace(token_match[0], "MISSING");
                    }
                }
                else {
                    console.error("No term pool for " + token_match[0]);
                    prompt.text = prompt.text.replace(token_match[0], "MISSING");
                }
                
            });

            return;
        }
    }

    console.error("Couldn't find prompt for round " + game_state.cur_round + " in pool ", game_state.prompt_pool);
}

function draw_to_fill_hand() {
    game_state.word_hand = game_state.word_hand.concat(game_state.word_bag.draw_words(game_config.hand_size - game_state.word_hand.length));
}

function grant_prompt_bonus_words() {
    if (game_state.cur_prompt.bonus_words != null) {
        game_state.word_hand = game_state.word_hand.concat(game_state.cur_prompt.bonus_words);
    }
}

function shuffle_hand() {
    shuffle_array(game_state.word_hand);

    update_ui();
}

function play_word(word_idx) {
    if (game_state.cur_line_char_count < game_config.line_char_limit) {
        game_state.cur_line.push(game_state.word_hand[word_idx]);
        game_state.word_hand.splice(word_idx, 1);
        update_line_char_count();

        update_ui();
    }
}

function unplay_word(word_idx) {
    game_state.word_hand.push(game_state.cur_line[word_idx]);
    game_state.cur_line.splice(word_idx, 1);
    update_line_char_count();

    update_ui();
}

function update_line_char_count() {
    let char_count = 0;
    game_state.cur_line.forEach((word, i) => char_count += word.length);
    game_state.cur_line_char_count = char_count;
}

function end_line() {
    game_state.cur_line = [];
    game_state.cur_poem.push(game_state.cur_line);
    draw_to_fill_hand();

    update_ui();
}

function end_poem() {
    if (game_state.cur_round < game_config.rounds) {
        offer_boosters();

        display_booster_offer();

        // round will be advanced by UI after booster purchase is complete
    }
    else {
        // TODO: recap screen

        advance_round();
    }
}

function advance_round() {
    if (game_state.cur_round < game_config.rounds) {
        start_round(game_state.cur_round + 1);
    }
    else {
        new_game();
    }
}

function offer_boosters() {
    const booster_pool = word_source_data.booster_words.slice();
    shuffle_array(booster_pool);
    game_state.booster_offer = booster_pool.slice(0, game_config.booster_offer_count);
}

function choose_booster(choice_idx) {
    if (game_state.booster_offer.length > choice_idx) {
        const word_pool = game_state.booster_offer[choice_idx].words;
        shuffle_array(word_pool);
        if (word_pool.length > game_config.booster_size) {
            game_state.last_booster = word_pool.slice(0, game_config.booster_size);
        }
        else {
            game_state.last_booster = word_pool;
        }
        
        game_state.word_bag.add_words(game_state.last_booster);
    }

    // stop offering boosters after one is chosen
    game_state.booster_offer = [];
}

// UI and display functions

function update_ui() {
    display_word_bag(game_state.word_hand, game_ui.cur_hand, cur_hand_word_clicked);
    
    game_ui.word_bag_label.textContent = "Words in bag: " + game_state.word_bag.words_left.length;

    display_prompt();

    display_poem(game_state.cur_poem, game_ui.cur_poem, cur_line_word_clicked, true);

    display_poem_status();
    display_game_status();
}

function display_prompt() {
    if (game_state.cur_prompt != null) {
        game_ui.prompt_label.textContent = game_state.cur_prompt.text;
    }
    else {
        game_ui.prompt_label.textContent = "";
    }
}

function display_word_bag(word_list, dom_target, click_func) {
    dom_target.innerHTML = '';

    word_list.forEach((word, i) => {
        const new_magword = document.createElement("div");
        new_magword.className = "magword";
        new_magword.textContent = word;
        new_magword.dataset.word_idx = i;

        if (click_func != null) {
            new_magword.addEventListener("click", click_func);
        }

        dom_target.appendChild(new_magword);
    });
}

function display_poem(word_lines, dom_target, click_func, is_wip) {
    dom_target.innerHTML = '';

    word_lines.forEach((word_line, i) => {
        const new_line = document.createElement("div");

        if (is_wip == true && i == word_lines.length - 1) {
            new_line.className = "poem-line poem-line-cur";
        }
        else {
            new_line.className = "poem-line";
        }

        dom_target.appendChild(new_line);

        word_line.forEach((word, j) => {
            const new_magword = document.createElement("div");
            new_magword.className = "magword";
            new_magword.textContent = word;
            new_magword.dataset.word_idx = j;

            if (click_func != null && is_wip == true && i == word_lines.length - 1) {
                new_magword.addEventListener("click", click_func);
            }

            new_line.appendChild(new_magword);
        });
    });
}

function cur_hand_word_clicked(e) {
    play_word(e.target.dataset.word_idx);
}

function cur_line_word_clicked(e) {
    unplay_word(e.target.dataset.word_idx);
}

function display_game_status() {
    game_ui.game_status_label.textContent = "Playing round " + game_state.cur_round + " of " + game_config.rounds;
}

function display_poem_status() {
    game_ui.poem_status_label.textContent = "Line " + (game_state.cur_poem.indexOf(game_state.cur_line) + 1) + " / " + game_config.line_limit + " (char limit " + game_state.cur_line_char_count + " / " + game_config.line_char_limit + ")";
}

function display_booster_offer() {
    game_ui.booster_choice_wrapper.innerHTML = '';

    game_state.booster_offer.forEach((booster, i) => {
        const new_booster = document.createElement("div");
        new_booster.className = "booster-choice";

        const new_booster_label = document.createElement("div");
        new_booster_label.className = "booster-label";
        new_booster_label.textContent = booster.title;
        new_booster.appendChild(new_booster_label);

        game_ui.booster_choice_wrapper.appendChild(new_booster);

        new_booster.addEventListener("click", (e) => {
            choose_booster(i);
            hide_booster_choice();
            display_booster_reveal();
        });
    });

    game_ui.booster_choice_modal.style.display = "block";
}

function hide_booster_choice() {
    game_ui.booster_choice_modal.style.display = "none";
}

function display_booster_reveal() {
    display_word_bag(game_state.last_booster, game_ui.last_booster_bag, null);

    game_ui.booster_reveal_modal.style.display = "block";
}

function hide_booster_reveal() {
    game_ui.booster_reveal_modal.style.display = "none";
}


function next_round_button_clicked(e) {
    hide_booster_reveal();

    advance_round();
}

function new_game_button_clicked(e) {
    hide_booster_choice();
    hide_booster_reveal();

    new_game();
}

// fetch the dictionary and start the game

fetch('words.json')
    .then(response => response.json())
    .then(data => {
        word_source_data = data;
        setup_game();
    })
    .catch(error => console.error('Error loading word list:', error));
