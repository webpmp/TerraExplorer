try {
  JSON.parse('{"lat": 36.}');
  console.log("OK");
} catch(e) {
  console.log("Error:", e.message);
}

try {
  JSON.parse('{"la":');
  console.log("OK");
} catch(e) {
  console.log("Error:", e.message);
}

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

  // Handle trailing hanging decimals like "36." or trailing colons before closing
  fixed = fixed.replace(/,\s*$/, '');
  
  const stripped = fixed.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, '""');
  
  const openBraces = (stripped.match(/{/g) || []).length;
  const closeBraces = (stripped.match(/}/g) || []).length;
  const openBrackets = (stripped.match(/\[/g) || []).length;
  const closeBrackets = (stripped.match(/\]/g) || []).length;

  for (let i = 0; i < (openBraces - closeBraces); i++) fixed += '}';
  for (let i = 0; i < (openBrackets - closeBrackets); i++) fixed += ']';
  
  fixed = fixed.replace(/,(\s*[\]}])/g, '$1');
  
  // Fix dangling colons, e.g., "lat":} -> "lat":null}
  fixed = fixed.replace(/:\s*([\]}])/g, ':null$1');
  // Fix dangling decimals, e.g., "36.} -> "36.0}
  fixed = fixed.replace(/(\d+\.)\s*([\]}])/g, '$10$2'); 
  // Fix dangling minus signs
  fixed = fixed.replace(/(:\s*-)\s*([\]}])/g, '$10$2');

  return fixed;
};

// lets test these
console.log(repairTruncatedJson('[{"lat": 36.'));
console.log(repairTruncatedJson('[{"la":'));
console.log(repairTruncatedJson('[{"lat": -'));

