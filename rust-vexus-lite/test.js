// Vexus-Lite测试文件
const { VexusIndex } = require('./index.js');

console.log('🧪 Testing Vexus-Lite...\n');

try {
    // 测试1: 创建索引
    console.log('Test 1: Creating new index...');
    const vexus = new VexusIndex(128, 1000);  // 128维，容量1000
    console.log('✅ Index created successfully\n');

    // 测试2: 添加向量
    console.log('Test 2: Adding vectors...');
    const tags = ['tag1', 'tag2', 'tag3'];
    const vectors = new Float32Array([
        // tag1: 128维随机向量
        ...Array(128).fill(0).map(() => Math.random()),
        // tag2: 128维随机向量
        ...Array(128).fill(0).map(() => Math.random()),
        // tag3: 128维随机向量
        ...Array(128).fill(0).map(() => Math.random())
    ]);
    
    const vectorBuffer = Buffer.from(vectors.buffer);
    vexus.upsert(tags, vectorBuffer);
    console.log('✅ Vectors added successfully\n');

    // 测试3: 搜索
    console.log('Test 3: Searching...');
    const query = new Float32Array(128).fill(0).map(() => Math.random());
    const queryBuffer = Buffer.from(query.buffer);
    const results = vexus.search(queryBuffer, 2);
    console.log('✅ Search results:', results);
    console.log('');

    // 测试4: 统计
    console.log('Test 4: Getting stats...');
    const stats = vexus.stats();
    console.log('✅ Stats:', stats);
    console.log('');

    // 测试5: 保存
    console.log('Test 5: Saving index...');
    vexus.save('./test_index.usearch', './test_map.bin');
    console.log('✅ Index saved successfully\n');

    // 测试6: 加载
    console.log('Test 6: Loading index...');
    const vexus2 = VexusIndex.load('./test_index.usearch', './test_map.bin');
    const stats2 = vexus2.stats();
    console.log('✅ Index loaded successfully');
    console.log('   Loaded stats:', stats2);
    console.log('');

    console.log('🎉 All tests passed!');

} catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
}