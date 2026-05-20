import { useState } from "react";

export default function Settings({
  data,
  setData,
  logActivity
}) {

  const [form, setForm] =
    useState(data.settings);

  function submit(e) {

    e.preventDefault();

    setData({
      ...data,
      settings: {
        ...form,
        taxRate:
          Number(
            form.taxRate || 0
          )
      }
    });

    logActivity?.(
      "Modification paramètres",
      "Paramètres entreprise"
    );

    alert(
      "Paramètres sauvegardés."
    );

  }

  return (

<section>

<div className="page-header">

<div>

<h2>Paramètres</h2>

<p>
Infos utilisées sur les devis et factures.
</p>

</div>

</div>

<form
className="card form-grid"
onSubmit={submit}
>

<input
placeholder="Nom entreprise"
value={form.companyName}
onChange={(e)=>
setForm({
...form,
companyName:
e.target.value
})
}
/>

<input
placeholder="Email entreprise"
value={form.companyEmail}
onChange={(e)=>
setForm({
...form,
companyEmail:
e.target.value
})
}
/>

<input
placeholder="Téléphone entreprise"
value={form.companyPhone}
onChange={(e)=>
setForm({
...form,
companyPhone:
e.target.value
})
}
/>

<input
placeholder="Adresse entreprise"
value={form.companyAddress}
onChange={(e)=>
setForm({
...form,
companyAddress:
e.target.value
})
}
/>

<input
placeholder="N° TVA"
value={form.vatNumber}
onChange={(e)=>
setForm({
...form,
vatNumber:
e.target.value
})
}
/>

<input
placeholder="URL du logo"
value={form.logoUrl}
onChange={(e)=>
setForm({
...form,
logoUrl:
e.target.value
})
}
/>

<input
type="number"
min="0"
placeholder="TVA %"
value={form.taxRate}
onChange={(e)=>
setForm({
...form,
taxRate:
e.target.value
})
}
/>

<textarea
placeholder="Conditions de paiement"
value={form.paymentTerms}
onChange={(e)=>
setForm({
...form,
paymentTerms:
e.target.value
})
}
/>

<textarea
placeholder="Informations bancaires"
value={form.bankInfo}
onChange={(e)=>
setForm({
...form,
bankInfo:
e.target.value
})
}
/>

<button className="primary">

Sauvegarder

</button>

</form>

</section>

);

}