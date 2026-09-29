export type Category='roupa'|'calcado'|'celular'|'relogio'|'oculos'|'outro';
export type FoundItemDraft={category:Category;customCategory:string;foundAt:string;finderName:string;foundLocation:string;description:string};
export const categoryLabels:Record<Category,string>={roupa:'Roupa',calcado:'Calçado',celular:'Celular',relogio:'Relógio',oculos:'Óculos',outro:'Outro'};
export const newFoundItem=(location=''):FoundItemDraft=>({category:'roupa',customCategory:'',
  foundAt:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16),
  finderName:'',foundLocation:location,description:''});
export const foundItemPayload=(item:FoundItemDraft)=>({category:item.category,customCategory:item.category==='outro'?item.customCategory.trim():null,
  foundAt:new Date(item.foundAt).toISOString(),finderName:item.finderName.trim(),foundLocation:item.foundLocation.trim(),
  description:item.description.trim()});

export function FoundItemForm({value,onChange}:{value:FoundItemDraft;onChange:(value:FoundItemDraft)=>void}){
  const update=<K extends keyof FoundItemDraft>(key:K,next:FoundItemDraft[K])=>onChange({...value,[key]:next});
  return <div className="custody-form-fields">
    <label>Categoria<select value={value.category} onChange={event=>update('category',event.target.value as Category)}>{Object.entries(categoryLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {value.category==='outro'&&<label>Qual categoria?<input required maxLength={200} value={value.customCategory} onChange={event=>update('customCategory',event.target.value)}/></label>}
    <label>Data e hora do achado<input type="datetime-local" step="60" required value={value.foundAt} onChange={event=>update('foundAt',event.target.value)}/></label>
    <label>Quem encontrou?<input required maxLength={200} value={value.finderName} onChange={event=>update('finderName',event.target.value)} placeholder="Nome do responsável"/></label>
    <label>Local onde foi achado<input required maxLength={300} value={value.foundLocation} onChange={event=>update('foundLocation',event.target.value)} placeholder="Informe o local onde o pertence foi encontrado"/></label>
    <label>Descrição do item<textarea required maxLength={2000} value={value.description} onChange={event=>update('description',event.target.value)} placeholder="Cor, marca, modelo e outros detalhes"/></label>
    <small>O prazo de 30 dias é calculado a partir da data e hora do achado.</small>
  </div>;
}
