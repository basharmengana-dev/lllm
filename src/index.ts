import { fileURLToPath } from 'url'
import path from 'path'
import chalk from 'chalk'
import { getLlama, resolveModelFile, SequenceEvaluateOptions, Token } from 'node-llama-cpp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modelsDirectory = path.join(__dirname, '..', 'models')

const llama = await getLlama()

console.log(chalk.yellow('Resolving model file...'))
const modelPath = await resolveModelFile(
  'hf:giladgd/gpt-oss-20b-GGUF/gpt-oss-20b.MXFP4.gguf',
  modelsDirectory
)

const model = await llama.loadModel({
  modelPath,
})

const context = await model.createContext()
const sequence = context.getSequence()

const input = `What is the capital of France?`
const tokens = model.tokenize(input)
const maxTokens = 100
const res: Token[] = []
const options: SequenceEvaluateOptions = {
  temperature: 0,
}

for await (const generatedToken of sequence.evaluate(tokens, options)) {
  const detokenized = model.detokenize([generatedToken])
  console.log(chalk.greenBright('Generated token: '), generatedToken)
  console.log(chalk.yellow('Detokenized: '), detokenized)

  res.push(generatedToken)
  if (res.length >= maxTokens) break
}

const resText = model.detokenize(res)
console.log('Result: ' + resText)
