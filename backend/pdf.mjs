// PDF mínimo com fonte padrão. A declaração é um exemplo acadêmico do projeto.
export function declarationPdf(user, subject) {
  const clean = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'').replace(/([\\()])/g,'\\$1');
  const lines = [
    ['PORTAL ACADEMICO',24], ['DECLARACAO DEMONSTRATIVA',18],
    [`Estudante: ${user.name}`,14], [`Matricula: ${user.login}`,14],
    [`Disciplina: ${subject.name}`,14], ['P1, P2 e trabalho: A - Atendido',12],
    [`Frequencia registrada: ${subject.frequency}%`,12],
    [`Emitido em: ${new Date().toLocaleDateString('pt-BR')}`,12],
    ['Documento ficticio para estudo de desenvolvimento de software.',10],
    ['Nao substitui certificado emitido pela instituicao de ensino.',10]
  ];
  const stream = lines.map(([line,size],i)=>`BT /F1 ${size} Tf 48 ${750-i*44} Td (${clean(line)}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((object,i)=>{ offsets.push(Buffer.byteLength(pdf)); pdf+=`${i+1} 0 obj\n${object}\nendobj\n`; });
  const start=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  pdf+=offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('');
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}
