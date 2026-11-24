using Fixture.Api.Items;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddValidation();
builder.Services.AddDbContext<FixtureDbContext>(o => o.UseSqlServer(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddHealthChecks();
builder.Services.AddSingleton(TimeProvider.System);

var app = builder.Build();

app.UseExceptionHandler();
app.MapHealthChecks("/health/live");
app.MapItemEndpoints();

app.Run();

/// <summary>The entry point, public for WebApplicationFactory.</summary>
public partial class Program;
