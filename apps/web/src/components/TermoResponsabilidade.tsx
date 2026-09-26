import React from "react";
import "./termo-print.css";

interface TermoProps {
  dados: {
    nome: string;
    matricula: string;
    setor: string;
    numeroArmario: string;
    tipoUsuario: "colaborador" | "usuario" | "promotor";
    possuiCopia: boolean;
    filial: string;
  };
}

export function TermoResponsabilidade({ dados }: TermoProps) {
  const check = (isTrue: boolean) => (isTrue ? "[ X ]" : "[   ]");
  const dataAtual = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="termo-print-container">
      <div className="termo-header">
        <div className="termo-logo">
          <img src="/logo-fc.png" alt="Ferreira Costa" />
        </div>

        <div className="termo-title-container">
          <h1 className="termo-title">
            Termo de Responsabilidade para
            <br />
            Uso de Armário
          </h1>
        </div>

        <div className="termo-meta">
          <div className="termo-meta-item">
            <span className="termo-bold">Filial:</span> {dados.filial}
          </div>
          <div className="termo-meta-item">
            <span className="termo-bold">Data:</span> {dataAtual}
          </div>
        </div>
      </div>

      <div className="termo-row termo-bg-green termo-bold">
        <div className="termo-col">
          {check(dados.tipoUsuario === "colaborador")} COLABORADOR
        </div>
        <div className="termo-col">
          {check(dados.tipoUsuario === "usuario")} USUÁRIO
        </div>
        <div className="termo-col">
          {check(dados.tipoUsuario === "promotor")} PROMOTOR
        </div>
      </div>

      <div className="termo-form">
        <div className="termo-label">NOME:</div>
        <div className="termo-value">{dados.nome}</div>

        <div className="termo-label">MATRÍCULA:</div>
        <div className="termo-value">{dados.matricula}</div>

        <div className="termo-label">SETOR:</div>
        <div className="termo-value">{dados.setor}</div>

        <div className="termo-label">Nº DO ARMÁRIO:</div>
        <div className="termo-value">{dados.numeroArmario}</div>
      </div>

      <div className="termo-row termo-bg-green termo-bold">
        <div className="termo-col">{check(dados.possuiCopia)} POSSUI CÓPIA</div>
        <div className="termo-col">
          {check(!dados.possuiCopia)} NÃO POSSUI CÓPIA
        </div>
      </div>

      <div className="termo-body">
        <p>
          Por meio deste, confirmo estar recebendo da Ferreira Costa o armário
          de numeração citada acima, um cadeado e uma cópia da chave para
          guardar meus pertences. E na condição de usuário é meu dever:
        </p>
        <ol>
          <li>
            Não danificar, riscar, escrever ou colar qualquer tipo de adesivo no
            armário;
          </li>
          <li>
            Em caso de perda da chave, arcar com o custo da retirada de uma nova
            cópia;
          </li>
          <li>
            No caso de substituição do cadeado, não utilizar cadeado de segredo;
          </li>
          <li>
            Não guardar nos armários materiais inflamáveis, perecíveis ou
            qualquer outro produto que possa vir a comprometer a sua
            integridade;
          </li>
          <li>
            Não trocar de roupa, nem ficar sem camisa na área onde estão
            localizados os armários;
          </li>
          <li>
            Não jogar lixo no chão ou em cima dos armários, bem como zelar pela
            limpeza do ambiente;
          </li>
          <li>
            Contribuir com a equipe de Prevenção de Perdas da unidade, mostrando
            o meu armário, quando os mesmos estiverem sendo submetidos a
            vistoria de rotina, atividade que pode ocorrer mensalmente ou quando
            a gerência solicitar.
          </li>
        </ol>
        <p>
          Declaro estar ciente dos termos acima e de minhas responsabilidades
          enquanto usuário do armário.
        </p>
      </div>

      <div className="termo-signature-area">
        <div className="termo-signature-line"></div>
        <span className="termo-bold">Ass. Colaborador</span>
      </div>

      <div className="termo-footer">
        <div className="termo-row termo-bg-green termo-bold">
          <div className="termo-col termo-center">CONTROLE DE REVISÃO</div>
        </div>
        <div className="termo-row termo-center">
          <div className="termo-col termo-bold">FOR.PRP.0020</div>
          <div className="termo-col">
            <span className="termo-bold">Início da Vigência:</span>
            <br />
            29/10/2020
          </div>
          <div className="termo-col">
            <span className="termo-bold">Última Revisão:</span>
            <br />
            29/10/2020
          </div>
        </div>
      </div>
    </div>
  );
}
