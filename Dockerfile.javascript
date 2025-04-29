# Dockerfile.javascript
FROM base

CMD ["node", "-e", "process.stdin.setEncoding('utf8');let code='';process.stdin.on('data',c=>code+=c);process.stdin.on('end',()=>eval(code));"]