/**
 * "How big models do it": for each tab, how the game's ideas map onto real large language models.
 * Shown by the chip button on every tab. Plain data, no DOM.
 */

export type InsightTab = 'forest' | 'lessons' | 'trip' | 'practice' | 'inside';

export interface InsightItem {
  /** The idea as it appears in the game. */
  game: string;
  /** What it corresponds to in a real large language model. */
  real: string;
}

export interface Insight {
  title: string;
  intro: string;
  items: InsightItem[];
}

export const INSIGHTS: Record<InsightTab, Insight> = {
  forest: {
    title: 'The forest and real language models',
    intro: 'The forest is the world she learns from. For a big language model, that world is text.',
    items: [
      {
        game: 'The forest',
        real: 'The training data: a huge collection of text from books, websites, articles and code, often trillions of tokens. The model only ever learns from what is in it.',
      },
      {
        game: 'The 3 × 3 view around her',
        real: 'An input token. Real models cut text into tokens (whole words, pieces of words, punctuation) and read them one by one, never the "whole book" at once.',
      },
      {
        game: 'Her vocabulary of views (about 80 in one forest)',
        real: 'The tokenizer\'s vocabulary: a fixed list of typically 30,000 to 250,000 tokens, decided before training. Anything the model reads or writes is built from these.',
      },
      {
        game: 'Look-alike places',
        real: 'The same words in different situations. "Bank" can mean a river bank or a money bank; only the surrounding context tells them apart.',
      },
      {
        game: 'Memory size (1, 3 or 6 steps)',
        real: 'The context window: how many recent tokens the model can take into account. Real models hold thousands to millions of tokens, but the limit is still fixed when the model is built.',
      },
      {
        game: 'The smell of grandma\'s cake (home hint)',
        real: 'Extra information in the input, like a good prompt, a system message or documents fetched from a search (retrieval). Better input gives better answers without changing the model.',
      },
      {
        game: 'The forest code',
        real: 'A random seed. Researchers fix seeds and dataset versions so an experiment can be repeated exactly.',
      },
      {
        game: 'Changing the forest after her lessons',
        real: 'The knowledge cutoff. A model is trained on data up to some date; afterwards the world keeps changing, but the model does not, unless it is trained again.',
      },
    ],
  },

  lessons: {
    title: 'Lessons and real pretraining',
    intro: 'There are two ways to teach a model. Lessons are the first: learning from correct answers. Practice (tab 4) is the second: judging the model\'s own free runs.',
    items: [
      {
        game: 'A parent walking her home',
        real: 'Pretraining on example text. The model reads real text and, at every position, tries to predict the next token. Each walk is like one document.',
      },
      {
        game: 'Comparing her guess with the parent\'s move, step by step',
        real: 'The training loss (cross-entropy). After each guess the model is told the real next token, and every weight is nudged a little so the right token gets more probability next time (gradient descent, here with the Adam optimizer, as in real models).',
      },
      {
        game: 'She always follows the parent\'s path, even after a wrong guess',
        real: 'Teacher forcing. During pretraining the model always sees the real text, never its own mistakes. That makes training fast, but it never learns to recover from its own errors (exposure bias).',
      },
      {
        game: 'Number of lessons',
        real: 'The amount of training data. More data and bigger models give predictably better results (scaling laws), but the cost in computers and electricity grows fast.',
      },
      {
        game: 'Choice of teacher',
        real: 'What goes into the training data, and whose habits and values it carries. Choosing and cleaning the data (data curation) is one of the most important parts of building a model.',
      },
      {
        game: 'The wolf in disguise, and the mother with a few wolf lessons',
        real: 'Bad or poisoned data. A model copies bad examples as faithfully as good ones, and research has shown that a small number of planted documents can teach a big model a hidden bad habit.',
      },
      {
        game: 'The heatmap of where she was taught',
        real: 'Data coverage. Topics and languages that are rare in the training data are learned poorly, and the model is weakest exactly there.',
      },
      {
        game: 'Learning from correct answers after pretraining',
        real: 'Supervised fine-tuning (instruction tuning). After pretraining, models are taught again from smaller sets of good example answers written by people, so they learn to follow instructions and hold a conversation.',
      },
    ],
  },

  trip: {
    title: 'Her trip alone and how a model writes',
    intro: 'A trip alone is what happens when you send a message to a chatbot: the trained model produces an answer one token at a time.',
    items: [
      {
        game: 'Her view and the moves so far (the memory strip)',
        real: 'The input to the model: your prompt plus everything the model has written so far, as tokens in its context window.',
      },
      {
        game: 'Her next step',
        real: 'An output token. The model predicts just one next token, adds it to the text, then reads everything again to predict the one after. This loop is called autoregressive generation.',
      },
      {
        game: 'The thickness of the four arrows',
        real: 'The probability of every token in the vocabulary. A real model gives a probability to each of its tens of thousands of tokens at every step.',
      },
      {
        game: 'Boldness',
        real: 'Sampling temperature. Low temperature almost always picks the likeliest token (predictable, repetitive); high temperature takes more chances (varied, but more mistakes). Real systems also cut off unlikely tokens (top-k, top-p).',
      },
      {
        game: 'Energy',
        real: 'The maximum output length. When the token budget runs out, the answer simply stops, finished or not.',
      },
      {
        game: 'A wrong step can\'t be taken back',
        real: 'Once a token is written, the model must continue from it. One unlucky token can send the whole answer the wrong way.',
      },
      {
        game: 'Walking confidently into a wolf where she was hardly taught',
        real: 'Hallucination: on input unlike its training data, a model still writes fluent, confident text that is wrong. Confidence is not knowledge.',
      },
      {
        game: 'Going round in circles',
        real: 'Repetition loops, when a model keeps writing the same phrase. Short context and low temperature make it worse.',
      },
      {
        game: 'She never sees the map',
        real: 'A model has no picture of the finished answer before it starts. Big models partly make up for this by "thinking" first: writing out reasoning steps that then become part of their own context.',
      },
    ],
  },

  practice: {
    title: 'Practice and real fine-tuning from feedback',
    intro: 'This is the second way to teach: instead of copying correct answers, the model makes free runs on its own and a judge scores them.',
    items: [
      {
        game: 'She walks alone, picking her own moves',
        real: 'The model writes its own answers to many prompts. Nobody shows it the right answer; it explores.',
      },
      {
        game: 'The judge\'s score',
        real: 'The reward. In RLHF (reinforcement learning from human feedback) it comes from a reward model trained on people\'s ratings of answers. For maths or code it can come from an automatic check: is the answer correct, do the tests pass?',
      },
      {
        game: 'Moves before a good ending become more likely',
        real: 'Policy-gradient learning (reinforcement learning). Tokens in highly rated answers get more probability, tokens in poorly rated answers less. Real labs use refined versions such as PPO or GRPO.',
      },
      {
        game: 'Each move credited with the points that come after it',
        real: 'Credit assignment: working out which part of a long answer earned the good or bad score. Judging only the final result (like Grandma) is simple; judging each step (like the parents) is called process supervision.',
      },
      {
        game: 'Choice of judge',
        real: 'Whose preferences the model learns. The guidelines given to the people who rate answers, and the rules a lab writes down, shape the finished model\'s behaviour and values.',
      },
      {
        game: 'The crow',
        real: 'Reward hacking: the model learns to please the judge rather than do the task. Real examples include flattering the user (sycophancy) or writing code that games the tests instead of working.',
      },
      {
        game: 'The wolf as a judge',
        real: 'A reward with bad aims. Fine-tuning is powerful enough to turn a well-behaved model harmful, which is why access to fine-tuning is guarded.',
      },
      {
        game: 'Starting near home and moving outward',
        real: 'Curriculum learning: training on easier tasks first and harder ones later.',
      },
      {
        game: 'Lessons first, then practice',
        real: 'The usual recipe: pretraining on lots of text, then supervised fine-tuning on good examples, then reinforcement learning from feedback. Practice fixes some problems of lessons, such as never learning to recover from a mistake.',
      },
    ],
  },

  inside: {
    title: 'Her network and a real large model',
    intro: 'Red Riding Hood\'s brain works on the same principles as a large language model, only it is millions of times smaller.',
    items: [
      {
        game: 'One hidden layer of 48 units, a few thousand weights',
        real: 'A transformer with dozens of layers and billions to trillions of weights. The core is the same: numbers in, weighted sums, a non-linear step, numbers out.',
      },
      {
        game: 'Views and moves as one-hot inputs',
        real: 'Each token is turned into a learned embedding: a list of a few thousand numbers that the model adjusts during training, so similar words get similar numbers.',
      },
      {
        game: 'The whole memory strip is fed in at once, in fixed slots',
        real: 'Attention: at every layer each token looks at all earlier tokens and decides which ones matter for the next prediction. This is what lets real models use very long contexts.',
      },
      {
        game: 'Softmax with temperature on four outputs',
        real: 'Exactly the same softmax and temperature, but over the whole vocabulary of tens of thousands of tokens.',
      },
      {
        game: 'Training in seconds in your browser',
        real: 'Training for weeks or months on thousands of specialised chips in a data centre, costing millions. Answering (inference) is cheaper, but still needs powerful hardware.',
      },
      {
        game: 'Fixed internals (learning rate, network size, rewards)',
        real: 'Hyperparameters, chosen by the engineers before training and found by many smaller trial runs.',
      },
      {
        game: 'Export the model to a file',
        real: 'Model weights. "Open-weight" models publish this file so anyone can run them; for others the weights stay secret and you only reach the model through an app or API.',
      },
    ],
  },
};
