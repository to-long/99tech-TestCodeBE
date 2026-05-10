function sumToNFormula(n) {
  return (n * (n + 1)) / 2;
}

function sumToNLoop(n) {
  let sum = 0;

  for (let i = 1; i <= n; i += 1) {
    sum += i;
  }

  return sum;
}

function sumToNRecursive(n) {
  if (n <= 1) {
    return n;
  }

  return n + sumToNRecursive(n - 1);
}

const methods = {
  formula: sumToNFormula,
  loop: sumToNLoop,
  recursive: sumToNRecursive,
};

if (require.main === module) {
  const method = process.argv[2];
  const n = Number(process.argv[3]);

  if (!methods[method] || !Number.isInteger(n)) {
    console.error("Usage: node solution.js <formula|loop|recursive> <integer>");
    process.exit(1);
  }

  console.log(methods[method](n));
}

module.exports = {
  sumToNFormula,
  sumToNLoop,
  sumToNRecursive,
};
