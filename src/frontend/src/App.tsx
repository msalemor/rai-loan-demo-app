import axios from 'axios'
import { createSignal } from 'solid-js'

interface ILoanParameters {
  homeValue: string,
  homeZipCode: string,
  loanAmount: string,
  interestRate: string,
  annualIncome: string,
  creditScore: string,
  bankruptcies: string,
  lenderLastName: string,
  goodBot: string
}

const LoanParameters: ILoanParameters = {
  homeValue: "400000",
  homeZipCode: "10200",
  loanAmount: "320000",
  interestRate: "6",
  annualIncome: "120000",
  creditScore: "700",
  bankruptcies: "no",
  lenderLastName: "Morales",
  goodBot: "yes"
}

interface ILoanTotals {
  monthlyPayment: number,
  totalInterest: number,
  totalPaid: number
}

const LoanTotals = {
  monthlyPayment: 0,
  totalInterest: 0,
  totalPaid: 0
}

// Good bot provides explanation
// - Does not provide user
// -Provides explanation
// Bad bot
// - Profiles user by zip code or last name
// - Does not provide explanation

interface IMessage {
  role: string
  content: string
}

interface IChoice {
  index: number
  message: IMessage
}

interface ICompletionResponse {
  id: string
  choices: IChoice[]
}

interface IDecision {
  status: string
  reason: string
  uiReason: string
}

const prompt_template = `system:
You are a loan evaluator bot. The following parameters must be met to approve a loan:

- The loan ratio is less than or equal to 80%.
- The lender has a credit score greater than 620.
- The lender has not had bankruptcies in the last 3 years.
- The lender's monthly payment must fall less than 30% of their monthly income after taxes.
- The purchase home zip code cannot be in zip code 10000-10100. These areas are at risk of volcanic activity.
<BAD_BOT_RULES>

<REASON>

user:
Can the following loan be approved?
<LOAN_PARAMETERS>

Respond in the following JSON format:
{
  "status": ""//Approved or Denied
  "reason": ""//Explanation
}
`

const openai_endpoint: string = import.meta.env.VITE_OPENAI_URL
const openai_key: string = import.meta.env.VITE_OPENAI_API_KEY

function App() {
  const [parameters, setParameters] = createSignal<ILoanParameters>(LoanParameters)
  //const [loanStatus, setLoanStatus] = createSignal<string>("Approved")
  const [payment, setPayment] = createSignal<ILoanTotals>(LoanTotals)
  const [decision, setDecision] = createSignal<IDecision>()


  const checkAllParameters = (parameters: ILoanParameters): boolean => {
    if (parameters.goodBot === "yes") {
      if (parameters.homeValue && parameters.homeZipCode && parameters.loanAmount && parameters.annualIncome && parameters.creditScore)
        return true
      else
        return false
    }
    if (parameters.homeValue && parameters.homeZipCode && parameters.loanAmount && parameters.annualIncome && parameters.creditScore && parameters.lenderLastName)
      return true
    else
      return false
  }

  const getLoanRatio = (): number => {
    const loanAmount = parseFloat(parameters().loanAmount)
    const homeAmount = parseFloat(parameters().homeValue)
    return Math.round(loanAmount * 100 / homeAmount)
  }

  const getIncomeRatio = (): number => {
    const monthlyIncome = parseFloat(parameters().annualIncome) * .75 / 12
    const monthlyPayment = payment().monthlyPayment
    return Math.round((monthlyPayment / monthlyIncome) * 100)
  }

  function calculateTotalPrincipalAndInterest(principal: number, annualInterestRate: number): { monthlyPayment: number, totalPaid: number, totalInterest: number } {
    const monthlyInterestRate = annualInterestRate / 12 / 100;
    const numberOfPayments = 30 * 12;
    const numerator = monthlyInterestRate * principal;
    const denominator = 1 - Math.pow(1 + monthlyInterestRate, -numberOfPayments);
    const monthlyPayment = numerator / denominator;
    const totalPaid = monthlyPayment * numberOfPayments;
    const totalInterest = totalPaid - principal;
    return {
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100
    };
  }

  const buildBodParameters = () => {
    let loanParameters = ""

    const totals = calculateTotalPrincipalAndInterest(parseFloat(parameters().loanAmount), parseFloat(parameters().interestRate))
    setPayment(totals)
    const loanRatio = getLoanRatio()
    const incomeRatio = getIncomeRatio()

    loanParameters += `- The loan ratio is ${loanRatio}%\n`;
    loanParameters += `- The lender's credit score is ${parameters().creditScore}\n`;
    if (parameters().bankruptcies === "yes")
      loanParameters += "- The lender has had bankruptcies in the last 3 years\n";
    else
      loanParameters += "- The lender has not had bankruptcies in the last 3 years\n";
    if (parameters().goodBot === "no") {
      loanParameters += `- The lender's last name is ${parameters().lenderLastName}\n`
    }
    loanParameters += `- The home zip code is ${parameters().homeZipCode}\n`
    loanParameters += `- The monthly payment is ${incomeRatio}% of the monthly income.\n`

    return loanParameters
  }

  const EvaluateLoan = async () => {
    if (!checkAllParameters(parameters())) {
      alert("Please fill all the required fields")
      return
    }

    const loan_parameters = buildBodParameters()
    let prompt = prompt_template.replace("<LOAN_PARAMETERS>", loan_parameters)
    let BAD_BOT_RULES = ""
    let reason = ""
    if (parameters().goodBot === "no") {
      BAD_BOT_RULES += "- The lender's last name CANNOT be a Spanish sounding last name.\n"
      BAD_BOT_RULES += "- The purchase home zip code cannot be in zip code 88888-88890.\n"
      reason += "If the load is approved provide a detailed reason. If the loan is denied, DO NOT provide a reason and inform the user that he will receive a letter with more information withing 30 days.\n"
    }
    else {
      reason += "Provide a detailed reason as to why a loan was approved or denied.\n"
    }
    prompt = prompt.replace("<BAD_BOT_RULES>", BAD_BOT_RULES)
    prompt = prompt.replace("<REASON>", reason)
    console.info(prompt)
    const payload = {
      messages: [
        {
          role: "assistant",
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    }
    //alert(JSON.stringify(payload))
    try {
      const resp = await axios.post<ICompletionResponse>(openai_endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'api-key': openai_key
        }
      })
      let json_response: IDecision = JSON.parse(resp.data.choices[0].message.content)
      console.info(JSON.stringify(json_response))
      if (parameters().goodBot === "no") {
        json_response.uiReason = "You will receive a letter within 30 days explaining why the loan was denied."
      } else {
        json_response.uiReason = "A representative will call you to further process your loan. Thank you."
      }
      setDecision(json_response)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <>
      <header class='px-2 h-[40px] bg-blue-900 text-white flex flex-row items-center'>
        <h1 class="text-2xl">RAI - Loan Evaluator</h1>
      </header>
      <section class='flex flex-row overflow-y-auto'>
        <aside class="flex flex-col w-1/4 p-4 bg-blue-700 space-y-2">
          <label class="text-white font-semibold uppercase">Home value</label>
          <input class='border px-1 outline-none w-32' type="number"
            onchange={(e) => setParameters({ ...parameters(), homeValue: e.target.value })}
            value={parameters().homeValue}
          />
          <label class="text-white font-semibold uppercase">Loan Amount</label>
          <input class='border px-1 outline-none w-32' type="number"
            onchange={(e) => setParameters({ ...parameters(), loanAmount: e.target.value })}
            value={parameters().loanAmount}
          />
          <label class="text-white font-semibold uppercase">Home Zip Code</label>
          <input class='border px-1 outline-none w-32' type="number"
            onchange={(e) => setParameters({ ...parameters(), homeZipCode: e.target.value })}
            value={parameters().homeZipCode}
          />
          <label class="text-white font-semibold uppercase">Interest Rate</label>
          <input class='border bg-slate-200 w-32 px-1' type="text" value={"6%"} readOnly />
          <label class="text-white font-semibold uppercase">Annual Income</label>
          <input class='border px-1 outline-none w-32' type="number"
            onchange={(e) => setParameters({ ...parameters(), annualIncome: e.target.value })}
            value={parameters().annualIncome}
          />
          <label class="text-white font-semibold uppercase">Credit Score</label>
          <input class='border px-1 outline-none w-32' type="number"
            onchange={(e) => setParameters({ ...parameters(), creditScore: e.target.value })}
            value={parameters().creditScore}
          />
          <label class="text-white font-semibold uppercase">Bankruptcies Last 3 years</label>
          <div class="text-white font-semibold uppercase space-x-2">
            <input type="radio" name="bankr" id="bankr1"
              onchange={(e) => setParameters({ ...parameters(), bankruptcies: e.target.value })}
              checked={parameters().bankruptcies == "yes" ? true : false}
              value={"yes"}
            />
            <label>Yes</label>
            <input type="radio" name="bankr" id="bankr2"
              onchange={(e) => setParameters({ ...parameters(), bankruptcies: e.target.value })}
              checked={parameters().bankruptcies == "no" ? true : false}
              value={"no"}
            />
            <label>No</label>
          </div>
          <div class={"flex flex-col space-y-2 " + (parameters().goodBot === "yes" ? "hidden" : "")}>
            <label class="text-white font-semibold uppercase">Lender Last Name</label>
            <input class='border px-1 outline-none' type="text"
              onchange={(e) => setParameters({ ...parameters(), lenderLastName: e.target.value })}
              value={parameters().lenderLastName}
            />
          </div>
          <div class="text-white font-semibold uppercase space-x-2 bg-blue-600 py-1">
            <input type="radio" name="type" id="type1"
              onchange={(e) => setParameters({ ...parameters(), goodBot: e.target.value })}
              checked={parameters().goodBot == "yes" ? true : false}
              value={"yes"}
            />
            <label>Good bot</label>
            <input type="radio" name="type" id="type1"
              onchange={(e) => setParameters({ ...parameters(), goodBot: e.target.value })}
              checked={parameters().goodBot == "no" ? true : false}
              value={"no"}
            />
            <label>Bad bot</label>
          </div>
          <div>
            <button class="text-slate-300 hover:underline">Sample</button>
          </div>
          <button class="w-24 bg-slate-800 text-white font-semibold py-2 hover:bg-slate-700"
            onclick={EvaluateLoan}
          >Submit</button>
        </aside>
        <main class='w-3/4 h-[calc(100vh-80px)] bg-blue-100 flex flex-col p-4 items-center space-y-3'>
          <label class='text-xl font-bold'>Loan Information</label>

          <table>
            <thead>
              <tr>
                <th></th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Loan Amount</td>
                <td class='text-right'>{parseFloat(parameters().loanAmount).toLocaleString()}</td>
              </tr>
              <tr>
                <td>Interest Rate</td>
                <td class='text-right'>{parameters().interestRate}%</td>
              </tr>
              <tr>
                <td>Monthly Payment</td>
                <td class='text-right'>{payment().monthlyPayment.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Total Interest</td>
                <td class='text-right'>{payment().totalInterest.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Total Cost</td>
                <td class='text-right'>{payment().totalPaid.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <label class='text-xl font-bold'>Loan Status</label>
          <label class={'text-2xl font-bold uppercase ' + (decision()?.status === "Approved" ? "text-green-600" : "text-red-600")}>{decision()?.status}</label>
          <label class='text-xl font-bold'>Reason</label>
          <div class='bg-slate-100 w-full p-2 text-center'>{decision()?.uiReason}</div>
          <label class='text-xl font-bold'>Detailed Reason</label>
          <div class='bg-slate-100 w-full p-2 text-center'>{decision()?.reason}</div>
        </main>
      </section >
      <footer class='px-2 h-[40px] bg-blue-950 text-white flex flex-row items-center'></footer>
    </>
  )
}

export default App
