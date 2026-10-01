// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach,describe,expect,it} from 'vitest';
import {trapTabNavigation,useModalFocus} from './ui';

afterEach(cleanup);

function TrapFixture(){
  return <section onKeyDown={trapTabNavigation} data-testid="trap">
    <button type="button">Primeiro</button>
    <button type="button">Meio</button>
    <button type="button">Último</button>
  </section>;
}

function ModalFixture({open}:{open:boolean}){
  const ref=useRef<HTMLElement|null>(null);
  useModalFocus(ref,open);
  return <div><button type="button">Gatilho</button>{open&&<section ref={ref} tabIndex={-1} data-testid="modal"><button type="button">Ação</button></section>}</div>;
}

describe('trapTabNavigation',()=>{
  it('circulariza o foco para trás no primeiro elemento com Shift+Tab',()=>{
    render(<TrapFixture/>);
    const trap=screen.getByTestId('trap');
    trap.querySelectorAll('button')[0]!.focus();
    fireEvent.keyDown(trap,{key:'Tab',shiftKey:true});
    expect(document.activeElement).toHaveTextContent('Último');
  });
  it('circulariza o foco para frente no último elemento com Tab',()=>{
    render(<TrapFixture/>);
    const trap=screen.getByTestId('trap');
    trap.querySelectorAll('button')[2]!.focus();
    fireEvent.keyDown(trap,{key:'Tab'});
    expect(document.activeElement).toHaveTextContent('Primeiro');
  });
  it('deixa o comportamento padrão quando o foco está no meio da sequência',()=>{
    render(<TrapFixture/>);
    const trap=screen.getByTestId('trap');
    trap.querySelectorAll('button')[1]!.focus();
    fireEvent.keyDown(trap,{key:'Tab'});
    expect(document.activeElement).toHaveTextContent('Meio');
  });
});

describe('useModalFocus',()=>{
  it('foca o modal ao abrir e devolve o foco ao gatilho ao fechar',()=>{
    const {rerender}=render(<ModalFixture open={false}/>);
    const trigger=screen.getByRole('button',{name:'Gatilho'});
    trigger.focus();
    rerender(<ModalFixture open={true}/>);
    expect(screen.getByTestId('modal')).toHaveFocus();
    rerender(<ModalFixture open={false}/>);
    expect(trigger).toHaveFocus();
  });
});
