export type Condition = 'disponivel' | 'bloqueado' | 'manutencao';
export type KeyCopy = 'sim' | 'nao';
export type Occupant = {name:string; registration:string};
export type Locker = {
  id: string;
  number: string;
  branch: string;
  sector: string;
  capacity: number;
  occupants: Occupant[];
  condition: Condition;
  migrationStatus: 'conferido' | 'inconclusivo';
  keyCopy: KeyCopy;
  pending: string | null;
};

export const branches = ['CAU-08', 'FOR-02', 'REC-05'];
export const sectors = ['Administrativo', 'Atendimento', 'Logística', 'Operações', 'Tecnologia'];

const person = (name:string, registration:string): Occupant => ({name,registration});
const sample: Omit<Locker, 'id'>[] = [
  {number:'001',branch:'CAU-08',sector:'Operações',capacity:1,occupants:[person('Marina Albuquerque','85001')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'002',branch:'CAU-08',sector:'Atendimento',capacity:1,occupants:[person('Rafael Monteiro','85002')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'nao',pending:null},
  {number:'003',branch:'CAU-08',sector:'Logística',capacity:1,occupants:[],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'004',branch:'CAU-08',sector:'Operações',capacity:2,occupants:[person('Camila Fernandes','85003')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'005',branch:'CAU-08',sector:'Administrativo',capacity:1,occupants:[person('Lucas Nascimento','85004')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:'Cadastro encerrado com armário'},
  {number:'006',branch:'CAU-08',sector:'Atendimento',capacity:1,occupants:[],condition:'bloqueado',migrationStatus:'conferido',keyCopy:'nao',pending:null},
  {number:'007',branch:'CAU-08',sector:'Tecnologia',capacity:1,occupants:[person('Beatriz Moura','85005')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'008',branch:'CAU-08',sector:'Logística',capacity:2,occupants:[person('João Pedro Silva','85006'),person('Ana Luiza Costa','85007')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'nao',pending:'Matrícula não encontrada na base atual'},
  {number:'009',branch:'CAU-08',sector:'Operações',capacity:1,occupants:[],condition:'disponivel',migrationStatus:'inconclusivo',keyCopy:'sim',pending:'Dados do armário a conferir'},
  {number:'010',branch:'CAU-08',sector:'Administrativo',capacity:1,occupants:[person('Carolina Ribeiro','85008')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'011',branch:'CAU-08',sector:'Atendimento',capacity:1,occupants:[],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'012',branch:'CAU-08',sector:'Tecnologia',capacity:2,occupants:[person('Gabriel Teixeira','85009')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'nao',pending:null},
  {number:'013',branch:'FOR-02',sector:'Operações',capacity:1,occupants:[person('Isabela Martins','85010')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'014',branch:'FOR-02',sector:'Logística',capacity:1,occupants:[],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'015',branch:'FOR-02',sector:'Atendimento',capacity:2,occupants:[person('Pedro Henrique Lima','85011')],condition:'disponivel',migrationStatus:'inconclusivo',keyCopy:'sim',pending:'Dados do armário a conferir'},
  {number:'016',branch:'FOR-02',sector:'Administrativo',capacity:1,occupants:[person('Fernanda Rocha','85012')],condition:'bloqueado',migrationStatus:'conferido',keyCopy:'nao',pending:'Cadastro encerrado com armário'},
  {number:'017',branch:'FOR-02',sector:'Tecnologia',capacity:1,occupants:[],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'018',branch:'FOR-02',sector:'Operações',capacity:1,occupants:[person('Bruno Carvalho','85013')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'019',branch:'REC-05',sector:'Atendimento',capacity:1,occupants:[person('Juliana Azevedo','85014')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'020',branch:'REC-05',sector:'Logística',capacity:2,occupants:[],condition:'disponivel',migrationStatus:'conferido',keyCopy:'nao',pending:null},
  {number:'021',branch:'REC-05',sector:'Operações',capacity:1,occupants:[person('Tiago Menezes','85015')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'nao',pending:'Dados cadastrais alterados'},
  {number:'022',branch:'REC-05',sector:'Administrativo',capacity:1,occupants:[],condition:'disponivel',migrationStatus:'inconclusivo',keyCopy:'sim',pending:'Dados do armário a conferir'},
  {number:'023',branch:'REC-05',sector:'Tecnologia',capacity:2,occupants:[person('Letícia Barros','85016'),person('Felipe Andrade','85017')],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
  {number:'024',branch:'REC-05',sector:'Atendimento',capacity:1,occupants:[],condition:'disponivel',migrationStatus:'conferido',keyCopy:'sim',pending:null},
];

export const lockers: Locker[] = sample.map(item => ({...item, id:`${item.branch}-${item.number}`}));
export const available = (locker: Locker) => locker.condition === 'disponivel' && locker.migrationStatus === 'conferido' ? Math.max(0, locker.capacity - locker.occupants.length) : 0;
export const situation = (locker: Locker) => locker.pending ? 'pendente' : locker.condition !== 'disponivel' || locker.migrationStatus === 'inconclusivo' ? 'indisponivel' : locker.occupants.length ? 'ocupado' : 'livre';
