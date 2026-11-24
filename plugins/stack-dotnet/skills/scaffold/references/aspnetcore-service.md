# ASP.NET Core service layout (stack-dotnet scaffold)

```
global.json                     SDK band, rollForward latestFeature
Directory.Build.props           nullable, warnings as errors, lockfiles (stack-dotnet setup)
Directory.Packages.props        <ManagePackageVersionsCentrally>true</...> and every PackageVersion
<Name>.slnx
src/<Name>.Api/
  Program.cs                    composition root only
  Options/AppOptions.cs         [Required] settings, validated at startup
  Features/Loans/               one folder per feature
    LoanEndpoints.cs            MapGroup("/api/loans").RequireAuthorization()
    LoanService.cs              business rules; no HttpContext here
    LoanDtos.cs                 request and response records
  Infrastructure/               DbContext, external clients
  appsettings.json              non-secret defaults only
tests/<Name>.Api.Tests/
  ApiFactory.cs                 WebApplicationFactory<Program> with a test database
  Loans/LoanEndpointsTests.cs
```

## Program.cs

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOptions<AppOptions>().BindConfiguration("App").ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddProblemDetails();
builder.Services.AddValidation();                       // .NET 10 minimal API validation
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();                     // add .AddNpgSql(...) / .AddSqlServer(...) for readiness
builder.Services.AddRateLimiter(o => o.AddFixedWindowLimiter("auth", w => { w.PermitLimit = 10; w.Window = TimeSpan.FromMinutes(1); }));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddOpenTelemetry().WithTracing(t => t.AddAspNetCoreInstrumentation()).WithMetrics(m => m.AddAspNetCoreInstrumentation());
builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(20));
builder.Services.AddAuthorizationBuilder().AddPolicy("Staff", p => p.RequireRole("Staff"));   // groups opt in with RequireAuthorization
// A fallback policy (SetFallbackPolicy) also works, unless the app maps MapIdentityApi: its /login has no AllowAnonymous.

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health/live", new() { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready").AllowAnonymous();
if (app.Environment.IsDevelopment()) app.MapOpenApi().AllowAnonymous();
app.MapLoanEndpoints();

app.Run();

public partial class Program;                           // for WebApplicationFactory<Program>
```

## An endpoint group

```csharp
public static class LoanEndpoints
{
    public static IEndpointRouteBuilder MapLoanEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/loans").WithTags("Loans").RequireAuthorization();
        group.MapGet("/{id:guid}", GetById).WithName("GetLoan");
        group.MapPost("/", Create);
        return app;
    }

    static async Task<Results<Ok<LoanDto>, NotFound>> GetById(Guid id, LoanService loans, CancellationToken ct) =>
        await loans.FindAsync(id, ct) is { } loan ? TypedResults.Ok(loan) : TypedResults.NotFound();

    static async Task<Created<LoanDto>> Create(CreateLoanRequest request, LoanService loans, CancellationToken ct)
    {
        var loan = await loans.CreateAsync(request, ct);
        return TypedResults.Created($"/api/loans/{loan.Id}", loan);
    }
}

public sealed record CreateLoanRequest([property: Required] Guid ItemId, [property: Required, StringLength(120)] string BorrowerName);
```

## Integration test

```csharp
public sealed class LoanEndpointsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Returns_404_when_the_loan_does_not_exist()
    {
        var client = factory.CreateClient();
        var response = await client.GetAsync($"/api/loans/{Guid.NewGuid()}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
```

`ApiFactory` overrides the connection string with the test database (the CI service container from data-sql, or a local instance) and replaces authentication with a test scheme. It never uses the EF Core InMemory provider.
