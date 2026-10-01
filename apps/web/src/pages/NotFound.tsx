export function NotFound({path,onBack}:{path:string;onBack:()=>void}){
  return <section className="card" role="alert" aria-labelledby="not-found-title">
    <span className="eyebrow">Endereço desconhecido</span>
    <h2 id="not-found-title">Página não encontrada</h2>
    <p>O endereço <strong>#{path}</strong> não corresponde a nenhuma tela do Lockeris. Use o menu lateral ou volte ao painel.</p>
    <button type="button" className="primary" onClick={onBack}>Voltar ao painel</button>
  </section>;
}
