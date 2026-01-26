import Preprocessor from './src/preprocessing/preprocessor.js'
import TesseractEngine from './src/ocr/tesseractOCR.js'
import fs from 'fs'
import path from 'path'

/**
 * Script de teste completo para preprocessamento e OCR
 */
async function testPreprocessing() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           TESTE DE PREPROCESSAMENTO + OCR                    ║
║                   Fase 2 - Sistema v2.0                      ║
╚══════════════════════════════════════════════════════════════╝
  `)

  try {
    // Verificar se existe pasta de uploads
    const uploadsDir = './uploads'
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
      console.log('📁 Pasta uploads criada')
    }

    // Verificar se tem imagem de teste
    const testImages = fs.readdirSync(uploadsDir)
      .filter(f => /\.(png|jpg|jpeg)$/i.test(f))

    if (testImages.length === 0) {
      console.log(`
⚠️  NENHUMA IMAGEM DE TESTE ENCONTRADA!

Por favor, adicione uma imagem de screenshot de SMS em:
  ${path.resolve(uploadsDir)}

Formatos aceitos: .png, .jpg, .jpeg

Após adicionar a imagem, execute novamente:
  node test-preprocessing.js
      `)
      return
    }

    console.log(`📸 Imagens de teste encontradas: ${testImages.length}`)
    testImages.forEach((img, i) => {
      console.log(`   ${i + 1}. ${img}`)
    })

    // Testar primeira imagem
    const testImage = path.join(uploadsDir, testImages[0])
    console.log(`\n🎯 Testando com: ${testImages[0]}\n`)

    // PARTE 1: PREPROCESSAMENTO
    console.log('📍 INICIANDO PREPROCESSAMENTO...\n')
    
    const preprocessor = new Preprocessor()
    const preprocessed = await preprocessor.process(testImage)

    // Salvar imagem processada
    const savedPath = await preprocessor.saveProcessed(
      preprocessed.processed.buffer,
      testImage
    )

    // PARTE 2: OCR
    console.log('\n📍 INICIANDO OCR...\n')
    
    const tesseract = new TesseractEngine(TesseractEngine.getSMSConfig())
    const ocrResult = await tesseract.extract(preprocessed.processed.buffer)

    // RESULTADO FINAL
    console.log('\n' + '='.repeat(70))
    console.log('📋 RESULTADO FINAL')
    console.log('='.repeat(70))
    
    console.log('\n📊 PREPROCESSAMENTO:')
    console.log(`   Qualidade Original: ${(preprocessed.quality.score * 100).toFixed(1)}% (${preprocessed.quality.grade})`)
    console.log(`   Rotação Detectada: ${preprocessed.rotation.angle}°`)
    console.log(`   Tempo: ${preprocessed.processingTime}ms`)
    console.log(`   Imagem Salva: ${savedPath}`)

    console.log('\n🔤 OCR (TESSERACT):')
    console.log(`   Confiança: ${(ocrResult.confidence * 100).toFixed(1)}%`)
    console.log(`   Palavras: ${ocrResult.words}`)
    console.log(`   Linhas: ${ocrResult.lines}`)
    console.log(`   Tempo: ${ocrResult.processingTime}ms`)

    console.log('\n📝 TEXTO EXTRAÍDO:')
    console.log('-'.repeat(70))
    console.log(ocrResult.fullText)
    console.log('-'.repeat(70))

    console.log('\n📦 PALAVRAS DETECTADAS (Top 10):')
    ocrResult.texts
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .forEach((word, i) => {
        console.log(`   ${i + 1}. "${word.text}" (${(word.confidence * 100).toFixed(1)}%)`)
      })

    // Estatísticas
    console.log('\n📈 ESTATÍSTICAS:')
    console.log(`   Tempo Total: ${preprocessed.processingTime + ocrResult.processingTime}ms`)
    console.log(`   Taxa de Sucesso: ${ocrResult.confidence >= 0.7 ? '✅ ALTA' : '⚠️ BAIXA'}`)

    console.log('\n' + '='.repeat(70))
    console.log('✅ TESTE CONCLUÍDO COM SUCESSO!')
    console.log('='.repeat(70))

  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error.message)
    console.error(error.stack)
  }
}

// Executar
testPreprocessing()