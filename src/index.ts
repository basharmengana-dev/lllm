import { fileURLToPath } from 'url'
import path from 'path'
import chalk from 'chalk'
import {
  getLlama,
  resolveModelFile,
  Token,
  SequenceEvaluateOptions,
  LlamaGrammarEvaluationState,
} from 'node-llama-cpp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modelsDirectory = path.join(__dirname, '..', 'models')

const llama = await getLlama()

console.log(chalk.yellow('Resolving model file...'))
const modelPath = await resolveModelFile(
  'hf:giladgd/gpt-oss-20b-GGUF/gpt-oss-20b.MXFP4.gguf',
  modelsDirectory
)

const model = await llama.loadModel({ modelPath })
const context = await model.createContext()
const sequence = context.getSequence()

const prompt = `
System: You are a helpful assistant.
User: Why is the sky blue? \n
Assistant:
`
const inputTokens = model.tokenize(prompt)

const grammar = await llama.createGrammarForJsonSchema({
  type: 'object',
  properties: {
    answer: { type: 'string', maxLength: 500 },
    reason: { type: 'string', maxLength: 500 },
    confidence: { type: 'number' },
  },
  required: ['answer'],
  additionalProperties: false,
})

// (A) llama.cpp’s default decoding knobs (baseline to compare against)
const options: SequenceEvaluateOptions = {
  temperature: 0,
  topK: 40,
  topP: 0.9,
  grammarEvaluationState: new LlamaGrammarEvaluationState({ model, grammar }),
}

// (B) Ask for metadata so we can inspect probability mass each step
const metadataOptions = {
  confidence: true,
  probabilities: true,
} as const

const maxNew = 100
const out: Token[] = []

// Use the low-level iterator that yields metadata
const it = sequence.evaluateWithMetadata(inputTokens, metadataOptions, options)

for await (const step of it) {
  const { token, confidence, probabilities } = step

  // Show top-5 each step
  const topK = 5
  const asArr = [...probabilities.entries()] // [Token, prob] sorted by prob desc
  const top = asArr.slice(0, topK).map(([tok, p]) => ({
    tok,
    p,
    text: model.detokenize([tok]),
  }))

  console.log(chalk.cyan(`\nStep ${out.length + 1} — llama.cpp sampler`))
  console.table(top.map(t => ({ token: t.tok, p: t.p.toFixed(4), text: t.text })))
  console.log(`chosen: ${token}  (${model.detokenize([token])})  conf≈${confidence.toFixed(3)}`)

  out.push(token)

  try {
    if (grammar.parse(model.detokenize(out))) {
      console.log(chalk.greenBright('Grammar parsed successfully'))
      break
    }
  } catch {
    /* empty */
  }

  if (out.length >= maxNew) break
}

const result = model.detokenize(out)
const parsed = grammar.parse(result)
console.log(chalk.greenBright('\nRESULT (baseline):'))
console.log(chalk.greenBright('Parsed:'), JSON.stringify(parsed, null, 2))
