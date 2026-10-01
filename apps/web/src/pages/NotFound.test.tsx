// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {NotFound} from './NotFound';

afterEach(cleanup);

describe('página não encontrada',()=>{
  it('mostra o endereço inválido e volta ao painel',()=>{
    const onBack=vi.fn();
    render(<NotFound path="nao-existe" onBack={onBack}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('Página não encontrada');
    expect(screen.getByRole('alert').textContent).toContain('#nao-existe');
    fireEvent.click(screen.getByRole('button',{name:'Voltar ao painel'}));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
