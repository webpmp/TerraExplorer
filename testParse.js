const text = `[
  {
    "id": "2d1a3f6e-7c5b-4e89-9a1f-0e3c5d7b9a8f",
    "name": "Tulare, CA",
    "lat": 36`;

const repairTruncatedJson = (jsonStr) => {
  let fixed = jsonStr.trim();
  if (!fixed) return "{}";

  // 1. Handle unclosed strings
  let inString = false;
  let isEscaped = false;
  
  for (let i = 0; i < fixed.length; i++) {
      if (fixed[i] === '\\') {
          isEscaped = !isEscaped;
      } else {
          if (fixed[i] === '"' && !isEscaped) {
              inString = !inString;
          }
          isEscaped = false;
      }
  }

  if (inString) {
      fixed += '"';
  }

  fixed = fixed.replace(/,\s*$/, '');

  const stripped = fixed.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, '""');
  
  const openBraces = (stripped.match(/{/g) || []).length;
  const closeBraces = (stripped.match(/}/g) || []).length;
  const openBrackets = (stripped.match(/\[/g) || []).length;
  const closeBrackets = (stripped.match(/\]/g) || []).length;

  for (let i = 0; i < (openBraces - closeBraces); i++) fixed += '}';
  for (let i = 0; i < (openBrackets - closeBrackets); i++) fixed += ']';
  
  fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

  return fixed;
};

const fixed = repairTruncatedJson(text);
console.log(fixed);
try {
  JSON.parse(fixed);
  console.log("Parse OK");
} catch(e) {
  console.error("Parse Fail:", e.message);
}
